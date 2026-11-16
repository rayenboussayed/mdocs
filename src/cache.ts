/**
 * The mdocs render cache — a two-tier, content-addressed memo for the
 * per-file work of the pipeline, stored in a single JSON file (default
 * `<cwd>/.mdocscache`; override with the `cachePath` config key).
 *
 * Tiers (the key space is prefixed by tier):
 *
 * - `md:<relpath>` — a fully rendered file: the finished markdown, symbol
 *   count, skip state and per-file notes. A hit skips everything: transpile,
 *   jsdoc, checker types, dmd, and the scratch machinery. Keyed on the
 *   source text, the whole TS program (for .ts files — any .ts change
 *   invalidates all of them), the per-file dist map, the `rootDistDir`
 *   pointer path, and the toolchain fingerprint.
 * - `tdata:<relpath>` — raw jsdoc `getTemplateData()` output, before
 *   normalization. A hit skips the jsdoc child process; normalize/checker/
 *   pointer/dmd steps still run against the current dist, so pointer lines
 *   are always fresh. Keyed on the source text and the toolchain fingerprint
 *   only.
 *
 * The cache is untrusted input (it is a file on disk, and it is disposable):
 * entries are zod-validated at load time and carried as inert data only — a
 * tampered cache can alter the markdown that gets written, but it never
 * influences which files are read, executed, or written elsewhere.
 *
 * Failure posture: the cache never fails a run. A corrupt, unreadable or
 * outdated cache is a miss — the file is treated as empty; a failed write is
 * a note in `RunResult.issues`. Two concurrent mdocs processes in the same
 * cwd are best-effort: one may drop the other's entries, never corrupt them
 * (entries are fp-tagged, so a wrong-fp hit cannot serve; the worst case is
 * a re-render).
 */
import { ensureDirectory } from 'jutilities/node/fs/dir'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

import type { CacheFile } from './schema.js'

import { errorMessage } from './errors.js'
import { readFileSourceMap } from './lines.js'
import { toPosix, walkFiles } from './resolve.js'
import { parseCacheFile } from './schema.js'
import { packageVersion } from './version.js'

/** Keep in sync with the zod caps in `schema.js`. */
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024
/** Keep in sync with the zod cap in `schema.js`. */
const MAX_DOCLETS = 10_000

/** Cache format version — bump on incompatible entry changes. */
const CACHE_FORMAT = 1
/** Maximum entries kept; least-recently-used are evicted first. */
const CACHE_CAP = 4096
/** Distinguishes cache behavior across renderer/output-format changes. */
const RENDER_FORMAT = 'mdocs-render-v2'
/** Cap on .d.ts declaration files swept into the program fingerprint. */
const DTS_SWEEP_CAP = 512

/** The cache as seen by the run — load once, read often, save once. */
export interface Cache {
  /**
   * Records a hit for `key` when (and only when) its `fp` matches.
   * @param key - The cache key (`md:`/`tdata:` + relative path).
   * @param fp - The fingerprint the caller computed.
   * @returns The entry when it matches, else `undefined`.
   */
  get(key: string, fp: string): CacheEntry | undefined
  /** Notes (cache unreadable, cache unwritable) — appended to `RunResult.issues`. */
  readonly issues: string[]
  /** Persists the cache atomically iff anything changed. Never throws. */
  save(): Promise<void>
  /**
   * Stores/merges an entry, evicting least-recently-used entries over cap.
   * @param key - The cache key (`md:`/`tdata:` + relative path).
   * @param entry - The entry payload (without `lastUsed`).
   */
  set(key: string, entry: CacheEntryInput): void
}

/** One cache entry — exactly what `schema.js` produces/accepts on disk. */
export type CacheEntry = CacheFile['entries'][string]

/** Per-file fingerprints and the tier-specific cache keys, computed once per run. */
export interface FileFingerprints {
  /** Fingerprint for the `tdata:` entry. */
  jsdocFp: string
  /** `md:<relative posix path>` — the tier-1 key. */
  key: string
  /** Fingerprint for the `md:` entry. */
  markdownFp: string
}

/** What gets stored; `lastUsed` is assigned by the cache itself. */
type CacheEntryInput = Omit<CacheEntry, 'lastUsed'>

/**
 * Loads a cache from disk (never throws), returning a ready-to-use handle.
 * @param options - The cache location.
 * @param options.path - Absolute path of the cache file.
 * @param options.cap - Maximum entries (default {@link CACHE_CAP}).
 * @param options.now - Clock override for tests (default {@link Date.now}).
 * @returns The cache (issues carry any problems found at load time).
 */
export async function createCache({ cap = CACHE_CAP, now = Date.now, path }: { cap?: number; now?: () => number; path: string }): Promise<Cache> {
  const issues: string[] = []
  let entries = new Map<string, CacheEntry>()
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config; no untrusted path
    const text = await readFile(path, 'utf8')
    const parsed = parseCacheFile(JSON.parse(text) as unknown)
    if (parsed === null) {
      issues.push(`cache at ${path} is corrupt or unsupported — starting with an empty cache`)
    } else {
      entries = new Map(Object.entries(parsed.entries))
      if (entries.size > cap) evict(entries, entries.size - cap)
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') issues.push(`cannot read cache at ${path}: ${errorMessage(error)} — starting empty`)
  }
  let dirty = false

  return {
    get(key, fp) {
      const entry = entries.get(key)
      if (entry === undefined || entry.fp !== fp) return undefined
      entry.lastUsed = now()
      dirty = true
      return entry
    },
    issues,
    async save() {
      if (!dirty) return
      dirty = false
      try {
        await ensureDirectory({ directory: dirname(path) })
        const envelope: CacheFile = { entries: Object.fromEntries(entries), version: CACHE_FORMAT }
        const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from the validated config + a random suffix; no untrusted path
        await writeFile(tmp, JSON.stringify(envelope), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from the validated config; no untrusted path
        await rename(tmp, path)
      } catch (error) {
        issues.push(`cannot write cache at ${path}: ${errorMessage(error)}`)
      }
    },
    set(key, entry) {
      // Refuse entries that would not survive a round trip through the schema —
      // storing one would invalidate the whole cache on the next load.
      if (entry.kind === 'md' && entry.markdown !== undefined && entry.markdown.length > MAX_MARKDOWN_BYTES) return
      if (entry.kind === 'tdata' && entry.doclets !== undefined && entry.doclets.length > MAX_DOCLETS) return
      entries.set(key, { ...entry, lastUsed: now() })
      if (entries.size > cap) evict(entries, entries.size - cap)
      dirty = true
    },
  }
}

/**
 * The dist-side fingerprint material for one file — hashes the dist map when
 * present, else a sentinel for its absence.
 * @param distJs - Absolute path of the expected dist `.js` file.
 * @returns `map:<sha256(mapJson)>` / `no-map` / `no-dist`.
 */
export async function distMaterialOf(distJs: string): Promise<string> {
  const info = await readFileSourceMap(distJs)
  if (info.kind === 'map') return `map:${sha256(info.mapJson)}`
  return info.kind
}

/**
 * The per-file fingerprints and tier keys for one source file.
 * @param args - The inputs to fingerprint.
 * @param args.file - The source file.
 * @param args.cwd - The run's working directory (cache keys are cwd-relative).
 * @param args.file.absPath - The absolute path of the source file.
 * @param args.file.extension - The source extension (e.g. `.ts`).
 * @param args.srcText - The source text (already read by the caller).
 * @param args.distMaterial - Dist-side material from {@link distMaterialOf}, or `null`.
 * @param args.isTypeScript - Whether the file is `.ts`-family.
 * @param args.programFp - {@link programFingerprint} of the run, or `null` for .js.
 * @param args.toolchainFp - {@link toolchainFingerprint} of the run.
 * @returns The fingerprints and both tier keys.
 */
export function fileFingerprints({ cwd, distMaterial, file, isTypeScript, programFp, srcText, toolchainFp }: {
  cwd: string
  distMaterial: string
  file: { absPath: string; extension: string }
  isTypeScript: boolean
  programFp: null | string
  srcText: string
  toolchainFp: string
}): FileFingerprints {
  const key = toPosix(relative(cwd, file.absPath))
  const sourceFp = sha256(srcText)
  const markdownFp = sha256([
    'md',
    RENDER_FORMAT,
    toolchainFp,
    key,
    file.extension,
    isTypeScript && programFp !== null ? sha256(`${sourceFp}:${programFp}`) : sourceFp,
    distMaterial,
  ].join('\n'))
  return {
    jsdocFp: sha256(['tdata', RENDER_FORMAT, toolchainFp, key, file.extension, sourceFp].join('\n')),
    key,
    markdownFp,
  }
}

/**
 * The sha256 of the lockfile in `cwd`, or `undefined` when absent/unreadable.
 * @param cwd - The run's working directory.
 * @returns The lockfile digest.
 */
export async function lockfileFingerprint(cwd: string): Promise<string | undefined> {
  for (const name of ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- lockfiles are fixed names in the validated workspace root; no untrusted path
      return sha256(await readFile(join(cwd, name)))
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * The whole-program fingerprint for .ts files — every source and declaration
 * file under the project roots, plus the lockfile and the TypeScript version.
 * Covers first-party `.d.ts` files that are imported but never roots.
 * Node_modules trees behind a lockfile are pinned by the lockfile hash; trees
 * drifted from their lockfile (postinstall patches) can serve stale types.
 * @param args - The inputs to fingerprint.
 * @param args.tsFiles - Absolute paths of every `.ts`-family file in the run (in any order).
 * @param args.sweep - Absolute paths of every `.d.ts` under the project roots (in any order).
 * @param args.lock - sha256 of the lockfile, or `undefined` when absent.
 * @returns A sha256 hex digest.
 */
export async function programFingerprint({ lock, sweep, tsFiles }: { lock: string | undefined; sweep: readonly string[]; tsFiles: readonly string[] }): Promise<string> {
  const parts: string[] = []
  for (const path of new Set(tsFiles)) parts.push(`t:${await hashFile(path)}`)
  for (const path of new Set(sweep)) parts.push(`d:${await hashFile(path)}`)
  parts.push(`lock:${lock ?? 'no-lockfile'}`, `ts:${ts.version}`)
  return sha256(parts.sort().join('\n'))
}

/**
 * Finds every `.d.ts` under the project roots (capped at {@link DTS_SWEEP_CAP}).
 * @param srcDirs - The resolved project source directories.
 * @param cap - The maximum number of declaration files to collect (default {@link DTS_SWEEP_CAP}).
 * @returns Absolute paths of declaration files, in stable sorted order.
 */
export async function sweepDeclarations(srcDirs: readonly string[], cap: number = DTS_SWEEP_CAP): Promise<string[]> {
  const issues: string[] = []
  const found: string[] = []
  for (const srcDir of srcDirs) {
    for (const path of await walkFiles(srcDir, issues)) {
      if (!path.endsWith('.d.ts') && !path.endsWith('.d.mts') && !path.endsWith('.d.cts')) continue
      found.push(path)
      if (found.length >= cap) return found.sort()
    }
  }
  return found.sort()
}

/**
 * Computes the cache fingerprint of the toolchain — everything about the
 * installed mdocs + jsdoc + TypeScript that can shape the rendered output.
 * @returns A sha256 hex digest.
 */
export function toolchainFingerprint(): string {
  const parts = [packageVersion(), ts.version, ...['dmd', 'handlebars', 'jsdoc', 'jsdoc-parse', 'jsdoc-to-markdown'].map(packageVersionOf), RENDER_FORMAT]
  return sha256(parts.join(':'))
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Drops the least-valuable entries until only `cap` remain.
 * @param entries - The entry map to trim in place.
 * @param overflow - How many entries to drop.
 */
function evict(entries: Map<string, CacheEntry>, overflow: number): void {
  /* v8 ignore next 1 — the call sites only invoke evict() for a positive overflow; the guard keeps direct calls honest. */
  if (overflow <= 0) return
  const ordered = [...entries.entries()].sort(([, left], [, right]) => evictionClass(left) - evictionClass(right) || left.lastUsed - right.lastUsed)
  for (const [key] of ordered.slice(0, overflow)) entries.delete(key)
}

/**
 * Eviction class: no-jsdoc skips first, then tdata, then full markdown.
 * @param entry - The entry to classify.
 * @returns 0 for skips, 1 for tdata, 2 for markdown.
 */
function evictionClass(entry: CacheEntry): number {
  if (entry.skipped === 'no-jsdoc') return 0
  return entry.kind === 'tdata' ? 1 : 2
}

/**
 * Sha256 hex of a file's contents, or `UNREADABLE` when it cannot be read.
 * @param path - The absolute path of the file to fingerprint.
 * @returns The hex digest, or the `UNREADABLE` sentinel.
 */
async function hashFile(path: string): Promise<string> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated workspace root; no untrusted path
    return sha256(await readFile(path))
  } catch {
    return 'UNREADABLE'
  }
}

/**
 * Version of an installed package, walking up from its entry point; `?` on failure.
 * @param name - The package name to look up.
 * @returns The package version, or `?` when it cannot be resolved.
 */
function packageVersionOf(name: string): string {
  try {
    const url = import.meta.resolve(name)
    let dir = dirname(fileURLToPath(url))
    for (;;) {
      const manifestPath = join(dir, 'package.json')
      const manifest = readManifest(manifestPath, name)
      if (manifest !== undefined) return manifest
      const parent = dirname(dir)
      /* v8 ignore next 1 — the walk always bottoms out inside an installed package with a matching manifest; the filesystem-root arm cannot happen for the fixed dep list. */
      if (parent === dir) return '?'
      dir = parent
    }
  } catch {
    /* v8 ignore start — `?` is the sentinel for a resolution failure or a repository root with no package.json; every install in this repo resolves so the arms cannot be reached from the test suite.
     * jutilities' own deps and every git-URL variant of an install are in scope here; nothing will fail on CI or dogfooding. */
    return '?'
  }
}

/**
 * Reads one `package.json`, returning its version when it names `name`.
 * @param manifestPath - Absolute path of the candidate manifest.
 * @param name - The expected package name.
 * @returns The package version, or `undefined` when the file is unusable.
 */
function readManifest(manifestPath: string, name: string): string | undefined {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved inside the package being fingerprinted; no untrusted path
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string; version?: string }
    /* v8 ignore next 4 — every dependency this list resolves reaches a manifest with a matching name and a string version; these arms cannot fire without a hand-built broken install. */
    if (manifest.name !== name) return undefined
    return String(manifest.version ?? '?')
  } catch {
    return undefined
  }
}

/**
 * Sha256 hex digest of `text`.
 * @param text - The string or buffer to hash.
 * @returns The lowercase hex digest.
 */
function sha256(text: Buffer | string): string {
  return createHash('sha256').update(text).digest('hex')
}
