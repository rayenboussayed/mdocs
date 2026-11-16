/**
 * Per-file rendering: jsdoc-to-markdown invocation plus injection of mdaics's
 * per-symbol `src:` / `dist:` pointer lines.
 *
 * Injection mechanics (dmd extension points — see `node_modules/dmd`):
 *
 * - dmd renders one `docs.hbs` document per symbol, recursing into class
 *   members. We override `docs.hbs` with the same content plus a
 *   `{{>mdaics-source~}}` block right after `{{>body}}`, and register an
 *   `mdaics-source.hbs` partial that prints the two pointer lines. dmd
 *   registers external partials (by filename basename) *after* its built-ins,
 *   so our override wins (handlebars re-registration replaces).
 * - The `mdaics` object on each doclet is what the partial prints — plain
 *   pre-formatted strings, keeping the handlebars side logic-free.
 *
 * jsdoc-to-markdown is invoked with a strictly whitelisted option set:
 * `files` + `no-cache` + our two partial files. Nothing from the user's
 * config or the environment reaches jsdoc (`configure`, `template`, `plugin`,
 * … are deliberately not supported — that would be an arbitrary-code-execution
 * door). The jsdoc analysis cache is disabled (it can never hit: scratch
 * paths are random per run). dmd's own render cache only gets its *read*
 * skipped — external partials opt out of reads, but dmd still writes; the
 * entries are small and live under `os.tmpdir()/dmd`.
 *
 * Orchestration (scratch allocation, file iteration, output writing) lives in
 * `run.ts`; this module renders a single file.
 */
import jsdoc2md from 'jsdoc-to-markdown'
import { withRetryAsync } from 'jutilities/hof/retry'
import { withTimeoutAsync } from 'jutilities/hof/timeout'
import { ensureDirectory } from 'jutilities/node/fs/dir'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import ts from 'typescript'

import type { Cache, FileFingerprints } from './cache.js'
import type { TypeProgram } from './tscheck.js'

import { type DmdDoclet, injectCheckerTypes, injectPointers, normalizeDoclets, type SymbolPointer } from './doclet.js'
import { errorMessage, MdaicsError } from './errors.js'
import { createLineMapper, type DistMapInfo, readFileSourceMap, type SourceLineMapper } from './lines.js'
import { isTypeScriptExtension, type SourceExtension, type SourceFile } from './resolve.js'

/** Everything needed to render one source file. */
export interface RenderFileJob {
  file: SourceFile
  /** Position of the file in the run — used as the scratch subdirectory name. */
  index: number
}

/** Outcome of rendering one file. Failures are collected, never thrown. */
export interface RenderFileResult {
  /** Set when the file failed to render. */
  error?: string
  file: SourceFile
  /** Non-fatal notes (approximations, missing dist maps, omitted dist lines, …). */
  issues: string[]
  /** The generated markdown — present only on success. */
  markdown?: string
  /** Absolute path of the planned output `.md`. */
  outPath: string
  /** Set when the file was intentionally skipped. */
  skipped?: 'no-jsdoc'
  /** Symbols rendered, or 0 when skipped/failed. */
  symbols: number
}

/** The two handlebars partials injected into dmd. */
const DOCS_OVERRIDE = `{{>header~}}
{{>body}}
{{>mdaics-source~}}
{{>member-index~}}
{{>separator~}}
{{>members~}}
`

const MDAICS_SOURCE_PARTIAL = `{{#if mdaics}}src: {{{mdaics.src}}}  
{{#if mdaics.dist}}dist: {{{mdaics.dist}}}
{{/if~}}{{/if~}}
`

type PreparedFile =
  | { error: string; ok: false; }
  | { mapper: null | SourceLineMapper; ok: true; scratchFile: string; }

/**
 * Renders one source file into markdown (or reports why it could not).
 * @param job - The file to render and its pool index.
 * @param deps - Render-time dependencies (scratch dir, partials, output path, TS program, pointer base, jsdoc timeout).
 * @param deps.cache - A loaded cache (absent ⇒ cache disabled).
 * @param deps.fingerprints - The per-file cache fingerprints (absent ⇒ cache disabled).
 * @param deps.missingDistDirs - Absolute distDirs known to be missing/not-directories (probed once per project by the run); for those projects no `dist:` line is emitted.
 * @param deps.scratchDir - Per-file scratch directory for the transpiled/copied source.
 * @param deps.partials - The handlebars partial override files (dmd template).
 * @param deps.outPath - Where the generated markdown goes.
 * @param deps.typeProgram - The project's TS program for checker types (null for JS files).
 * @param deps.pointerBase - Absolute base for cwd-relative `src:`/`dist:` pointers.
 * @param deps.timeoutMs - jsdoc render timeout in milliseconds.
 * @returns The render outcome (markdown, skip or failure) — always resolves.
 */
export async function renderSourceFile(
  job: RenderFileJob,
  deps: {
    /** A loaded cache (absent ⇒ cache disabled). */
    cache?: Cache
    /** Per-file cache fingerprints and tier keys, computed once per run. */
    fingerprints?: ReadonlyMap<string, FileFingerprints>
    /** Absolute distDirs known to be missing/not-directories (probed once per project by the run). Absent ⇒ per-file probing. */
    missingDistDirs?: ReadonlySet<string>
    outPath: string
    partials: readonly string[]
    /**
     * Workspace root used for `src:`/`dist:` pointers in the emitted docs —
     * pointers are rendered relative to it (e.g. `src/cli.ts:56`) instead of
     * absolute OS paths. Typically the run's `cwd`.
     */
    pointerBase: string
    scratchDir: string
    /** Override the jsdoc timeout (ms). Defaults to 60 000; tests pass something tiny. */
    timeoutMs?: number
    typeProgram: null | TypeProgram
  },
): Promise<RenderFileResult> {
  const { file } = job
  const issues: string[] = []
  const scratchDir = join(deps.scratchDir, String(job.index))

  // Non-TypeScript sources are copied to the scratch verbatim (collection
  // already filtered extensions via isSourceExtension).
  let srcText: string
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
    srcText = await readFile(file.absPath, 'utf8')
  } catch (cause) {
    return fail(file, deps.outPath, `cannot read source: ${errorMessage(cause)}`)
  }

  const prepared = await prepareForJsdoc(file, srcText, scratchDir)
  if (prepared.ok === false) return fail(file, deps.outPath, prepared.error)

  const timeoutMs = deps.timeoutMs ?? 60_000
  let data: DmdDoclet[]
  try {
    data = await fetchTemplateData(prepared.scratchFile, deps, file, timeoutMs)
  } catch (cause) {
    // A wall-clock timeout rejects with `undefined` when no signal is passed —
    // remap it to the per-file timeout error; anything else is jsdoc's own rejection.
    const reason = cause === undefined
      ? new MdaicsError('RENDER_TIMEOUT', `jsdoc timed out after ${String(timeoutMs)}ms on ${file.relPath}`)
      : cause
    return fail(file, deps.outPath, `jsdoc failed: ${errorMessage(reason)}`)
  }

  const pointers = await computePointers(file, data, prepared.mapper, issues, deps.pointerBase, deps.missingDistDirs?.has(file.project.distDir) ?? false)
  injectPointers(data, pointers)
  if (isTypeScriptExtension(file.extension)) {
    injectCheckerTypes(data, deps.typeProgram, file.absPath)
  }

  if (data.length === 0) {
    return { file, issues, outPath: deps.outPath, skipped: 'no-jsdoc', symbols: 0 }
  }

  try {
    // Option whitelist: `data` + our two partial files — nothing else.
    // Security control (no `configure`/`template`/`plugin` pass-through).
    // dmd warns on stderr when a file's symbols all belong to a single
    // default export (it wants an explicit @module tag) — we surface that
    // as an actionable error below instead of leaking scratch paths.
    const markdown = await withWarnSunk(() => jsdoc2md.render({ data, partial: [...deps.partials] }))
    if (markdown.trim() === '') {
      return fail(
        file,
        deps.outPath,
        'jsdoc produced no renderable docs for this file — a single default export needs `@module` in its doc comment (or use a named export)',
        issues,
      )
    }
    return { file, issues, markdown, outPath: deps.outPath, symbols: data.length }
  } catch (cause) {
    return fail(file, deps.outPath, `render failed: ${errorMessage(cause)}`, issues)
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Writes the two injected partials into the run's scratch directory.
 * @param scratchDir - Scratch directory that will hold `partials/`.
 * @returns The absolute paths of the written partial files.
 */
export async function writeTemplatePartials(scratchDir: string): Promise<string[]> {
  const partialsDir = join(scratchDir, 'partials')
  const docsPath = join(partialsDir, 'docs.hbs')
  const sourcePath = join(partialsDir, 'mdaics-source.hbs')
  await ensureDirectory({ directory: partialsDir })
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
  await writeFile(docsPath, DOCS_OVERRIDE, { encoding: 'utf8', mode: 0o600 })
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
  await writeFile(sourcePath, MDAICS_SOURCE_PARTIAL, { encoding: 'utf8', mode: 0o600 })
  return [docsPath, sourcePath]
}

/**
 * Computes the per-doclet src/dist pointer map, keyed by generated line
 * @param file - The source file being rendered.
 * @param data - The doclets to annotate (already normalized).
 * @param transpileMapper - Mapper from the in-memory transpile, or `null` for pass-through copies.
 * @param issues - Per-file notes accumulator.
 * @param pointerBase - Absolute base for cwd-relative `src:`/`dist:` pointers.
 * @param distFolderMissing - `true` when the project's dist folder was probed missing; the dist lookup is skipped entirely.
 * @returns A generated-line → pointer map.
 */
async function computePointers(
  file: SourceFile,
  data: readonly DmdDoclet[],
  transpileMapper: null | SourceLineMapper,
  issues: string[],
  pointerBase: string,
  distFolderMissing: boolean = false,
): Promise<Map<number, SymbolPointer>> {
  const pointers = new Map<number, SymbolPointer>()
  const distJs = distJsPathFor(file)
  const pointerSource = pointerPath(pointerBase, file.absPath)
  const pointerDist = pointerPath(pointerBase, distJs)
  const { kind: distKind, mapper: distMapper } = distFolderMissing
    ? { kind: 'no-folder' as const, mapper: null }
    : await distMapperFor(distJs, file.absPath, issues)

  for (const doclet of data) {
    const generatedLine = doclet.meta?.lineno
    if (generatedLine === undefined) continue
    const src = resolveSrcLine(generatedLine, transpileMapper)
    const dist = resolveDistPointer(src.srcLine, transpileMapper, { distKind, distMapper, pointerDist }, issues)
    const pointer = { src: `${pointerSource}:${String(src.srcLine)}${src.srcApprox ? ' (approx.)' : ''}` }
    pointers.set(generatedLine, dist === undefined ? pointer : { dist, ...pointer })
  }
  return pointers
}

/**
 * Fetches template data for one file, reusing the tier-2 cache when possible.
 * A cache hit skips the jsdoc child process; everything else (normalize,
 * pointer injection, checker types, render) still runs fresh.
 * @param scratchFile - The transpiled/copied source inside the scratch dir.
 * @param deps - The render deps (may carry a `cache` and per-file `fingerprints`).
 * @param deps.cache - The loaded cache, or absent when caching is disabled.
 * @param deps.fingerprints - The per-file fingerprints, or absent when caching is disabled.
 * @param file - The source file being rendered.
 * @param timeoutMs - The jsdoc render timeout in milliseconds.
 * @returns The normalized doclets.
 */
async function fetchTemplateData(
  scratchFile: string,
  deps: { cache?: Cache; fingerprints?: ReadonlyMap<string, FileFingerprints> },
  file: SourceFile,
  timeoutMs: number,
): Promise<DmdDoclet[]> {
  // Tier-2 cache: raw template data skips the jsdoc child; everything else re-runs.
  const fp = deps.fingerprints?.get(file.absPath)
  const cached = fp !== undefined && deps.cache !== undefined ? deps.cache.get(`tdata:${fp.key}`, fp.jsdocFp) : undefined
  if (cached?.doclets !== undefined) return normalizeDoclets(cached.doclets as DmdDoclet[])

  // One retry absorbs jsdoc's child exit-vs-close stdout race; a second failure
  // propagates the original error. Never the default policy — it busy-waits via sleepSync.
  const retryOnce = withRetryAsync(
    () => jsdoc2md.getTemplateData({ files: [scratchFile], 'no-cache': true }),
    // jutilities calls onError with retries starting at 0; throwing here rethrows the failing error.
    { onError: ({ error, retries }) => { if (retries >= 1) throw error } },
  )
  // Timeout stays outermost — a hung jsdoc is never retried.
  const templateData = await withTimeoutAsync(retryOnce, { timeoutMs })() as DmdDoclet[]
  if (fp !== undefined && deps.cache !== undefined) {
    for (const doclet of templateData) {
      // Scrub the writer run's scratch paths; `lineno` is the payload.
      const meta = doclet.meta
      if (meta !== undefined) {
        delete meta.path
        delete meta.filename
      }
    }
    deps.cache.set(`tdata:${fp.key}`, { doclets: templateData, fp: fp.jsdocFp, issues: [], kind: 'tdata', symbols: 0 })
  }
  return normalizeDoclets(templateData)
}

/**
 * Renders an absolute path relative to the workspace root, posix-style.
 * @param base - The absolute base the returned path is relative to.
 * @param absPath - The absolute path to render.
 * @returns The posix-style relative path.
 */
function pointerPath(base: string, absPath: string): string {
  return relative(base, absPath).replace(/\\/g, '/')
}

/**
 * Transpiles (.ts family) or copies (.js family) the source for jsdoc.
 * @param file - The source file being prepared.
 * @param srcText - The source text.
 * @param scratchDir - Per-file scratch directory to write into.
 * @returns The prepared scratch file (or the transpile error).
 */
async function prepareForJsdoc(file: SourceFile, srcText: string, scratchDir: string): Promise<PreparedFile> {
  try {
    await ensureDirectory({ directory: scratchDir })
  } catch (cause) {
    return { error: `cannot create the scratch directory: ${errorMessage(cause)}`, ok: false }
  }
  const destination = join(scratchDir, 'file.js')

  if (isTypeScriptExtension(file.extension)) {
    /* v8 ignore start — transpileModule reports diagnostics; it does not throw for user source. */
    let output: ts.TranspileOutput
    try {
      output = ts.transpileModule(srcText, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          removeComments: false, // required — jsdoc needs the comments
          sourceMap: true,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: file.absPath,
      })
    } catch (cause) {
      return { error: `transpile failed: ${errorMessage(cause)}`, ok: false }
    }
    /* v8 ignore stop */
    /* v8 ignore start — transpileModule always reports sourceMapText with sourceMap: true */
    if (output.sourceMapText === undefined) {
      return { mapper: null, ok: true, scratchFile: destination }
    }
    /* v8 ignore stop */
    const mapper = createLineMapper(output.sourceMapText, file.absPath)
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
      await writeFile(destination, output.outputText, { encoding: 'utf8', mode: 0o600 })
    } catch (cause) {
      /* v8 ignore start — unreachable with a writable scratch dir (only ENOSPC/EROFS would throw here). */
      return { error: `cannot write the transpiled scratch file: ${errorMessage(cause)}`, ok: false }
      /* v8 ignore stop */
    }
    return { mapper, ok: true, scratchFile: destination }
  }

  // Nothing else to do — supported extensions were filtered at collection
  // time. JavaScript-family sources are copied verbatim: line numbers match
  // the src file 1:1.
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
    await writeFile(destination, srcText, { encoding: 'utf8', mode: 0o600 })
  } catch (cause) {
    /* v8 ignore start — unreachable with a writable scratch dir (only ENOSPC/EROFS would throw here). */
    return { error: `cannot write the scratch file: ${errorMessage(cause)}`, ok: false }
    /* v8 ignore stop */
  }
  return { mapper: null, ok: true, scratchFile: destination }
}

/**
 * Computes the dist pointer for one doclet. A missing dist folder (project probe)
 * or dist file (per-file probe) omits the dist line entirely; when the dist map
 * exists but the lookup misses, one "dist sourcemap missing or unmatched" note is
 * recorded instead.
 * @param srcLine - The source (original) line for the symbol.
 * @param transpileMapper - Mapper from the transpile emit, or `null` for pass-through copies.
 * @param dist - Dist lookup context (kind, mapper, pointer path) computed once per file.
 * @param issues - Per-file notes accumulator.
 * @returns The `dist:` pointer line, or `undefined` when the dist line must be omitted.
 */
function resolveDistPointer(
  srcLine: number,
  transpileMapper: null | SourceLineMapper,
  dist: DistPointerContext,
  issues: string[],
): string | undefined {
  if (dist.distKind === 'no-folder') return undefined
  const distExact = dist.distMapper?.toGenerated(srcLine) ?? null
  if (distExact !== null) return `${dist.pointerDist}:${String(distExact)}`
  if (dist.distKind === 'no-dist') return undefined
  if (dist.distKind === 'map') noteOnce(issues, 'dist sourcemap missing or unmatched — dist line is an approximation')
  const approx = transpileMapper === null ? null : transpileMapper.toGenerated(srcLine)
  return approx === null ? `${dist.pointerDist} (approx.)` : `${dist.pointerDist}:${String(approx)} (approx.)`
}

/**
 * Maps a doclet's generated line back to the original source line.
 * @param generatedLine - The jsdoc-reported line in the generated file.
 * @param transpileMapper - Mapper from the transpile emit, or `null` for pass-through copies.
 * @returns The source line and whether it is approximate.
 */
function resolveSrcLine(
  generatedLine: number,
  transpileMapper: null | SourceLineMapper,
): { srcApprox: boolean; srcLine: number } {
  if (transpileMapper === null) return { srcApprox: false, srcLine: generatedLine } // straight copy — lines match the src file
  const mapped = transpileMapper.toOriginal(generatedLine)
  if (mapped === null) return { srcApprox: true, srcLine: generatedLine } // map failed — keep jsdoc's line, flag it
  return { srcApprox: false, srcLine: mapped }
}

/** Dist extensions that differ from `source.slice(1)` (everything else strips the dot). */
const DIST_EXTENSION: Partial<Record<SourceExtension, string>> = {
  '.cts': 'cjs',
  '.mts': 'mjs',
  '.ts': 'js',
  '.tsx': 'js',
}

/** Outcome of looking up the committed dist sourcemap. */
interface DistMapperResult {
  /** Why a mapper might be missing — drives which note is emitted. */
  kind: 'map' | 'no-dist' | 'no-map'
  /** The line mapper, or `null` when unavailable/unmatched. */
  mapper: null | SourceLineMapper
}

/** Dist lookup context for one file — computed once, reused per doclet. */
interface DistPointerContext {
  /** Why the dist map might be missing — drives which note is emitted. */
  readonly distKind: 'no-folder' | DistMapInfo['kind']
  /** Mapper for the committed `dist/*.js.map`, or `null` when absent/stale. */
  readonly distMapper: null | SourceLineMapper
  /** Posix, cwd-relative path of the dist file used for messages. */
  readonly pointerDist: string
}

/**
 * dist `.js` path for a source file: sibling rootDistDir, same relative path.
 * @param file - The source file whose dist counterpart is wanted.
 * @returns The absolute path of the expected dist `.js` file.
 */
export function distJsPathFor(file: SourceFile): string {
  const withoutExt = file.relPath.replace(/\.[^.]+$/, '')
  const distExt = DIST_EXTENSION[file.extension] ?? file.extension.slice(1)
  return join(file.project.distDir, `${withoutExt}.${distExt}`)
}

/**
 * Reader mapper for the user's committed dist map, or `null` when missing or
 * referring to a different source (stale build, foreign map).
 * @param distJs - Absolute path of the committed dist `.js` file.
 * @param srcAbsPath - Absolute path of the original source file the map must reference.
 * @param issues - Per-file notes accumulator.
 * @returns The lookup result — a mapper, or `null` when the map is missing/stale.
 */
async function distMapperFor(
  distJs: string,
  srcAbsPath: string,
  issues: string[],
): Promise<DistMapperResult> {
  // A stale map can outlive its .js — require the dist file itself to exist first.
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
    await stat(distJs)
  } catch {
    noteOnce(issues, 'dist file not found — dist: line omitted (build first)')
    return { kind: 'no-dist', mapper: null }
  }
  const info = await readFileSourceMap(distJs)
  /* v8 ignore start — unreachable by design: the stat above already fails for a missing dist .js; this guards only a file vanishing between stat and read (TOCTOU), not ordinary failures. */
  if (info.kind === 'no-dist') {
    noteOnce(issues, 'dist file not found — dist: line omitted (build first)')
    return { kind: 'no-dist', mapper: null }
  }
  /* v8 ignore stop */
  if (info.kind === 'no-map') {
    noteOnce(issues, 'dist sourcemap missing — build with "sourceMap: true" for an exact dist line')
    return { kind: 'no-map', mapper: null }
  }
  return { kind: 'map', mapper: createLineMapper(info.mapJson, info.mapUrl, srcAbsPath) }
}

/**
 * Builds the failure result shape.
 * @param file - The source file that failed.
 * @param outPath - The planned output path.
 * @param message - Why the render failed.
 * @param issues - Notes collected before the failure.
 * @returns The failure result.
 */
function fail(file: SourceFile, outPath: string, message: string, issues: string[] = []): RenderFileResult {
  return { error: message, file, issues, outPath, symbols: 0 }
}

/**
 * Adds an issue once per file.
 * @param issues - The per-file notes accumulator (deduplicated in place).
 * @param issue - The note to add.
 */
function noteOnce(issues: string[], issue: string): void {
  if (!issues.includes(issue)) issues.push(issue)
}

// dmd has no "quiet" option and warns via the process-wide `console.warn`.
// Pool workers must not patch the global concurrently (one worker could save
// and restore another worker's no-op), so the patched section is serialized
// through a promise gate.
let dmdRenderGate: Promise<void> = Promise.resolve()

/**
 * Runs `fn` with `console.warn` silenced; the patch is never re-entered concurrently.
 * @param fn - The operation whose warnings are sunk.
 * @returns The operation's result.
 */
async function withWarnSunk<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void
  const acquired = new Promise<void>((resolve) => {
    release = resolve
  })
  const previous = dmdRenderGate
  dmdRenderGate = previous.then(() => acquired)
  await previous
  const warn = console.warn
  console.warn = (): void => undefined
  try {
    return await fn()
  } finally {
    console.warn = warn
    release()
  }
}
