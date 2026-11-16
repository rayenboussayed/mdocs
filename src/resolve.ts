/**
 * Resolution of config roots to concrete projects and source files.
 *
 * The model is deliberately simple:
 *
 * - A config's `rootSrcDir` entries are either plain directories or glob
 *   patterns (e.g. `packages/<pkg>/src`). Patterns are expanded with the built-in
 *   `fs.promises.glob` against `cwd`; a pattern that matches nothing is a
 *   hard error (fail fast beats silently generating zero docs).
 * - Each resolved src directory `S` produces a sibling `S/../<rootDistDir>`
 *   (reader pointer for the build) and a sibling `S/../<outDirName>` (where
 *   the generated `*.md` files go). This one rule covers both the regular
 *   repo (`./src` → `./dist` + `./docs`) and monorepos (`packages/foo/src` →
 *   `packages/foo/dist` + `packages/foo/docs`).
 * - Overlapping roots (one src dir inside another) are rejected.
 */
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- fs.glob is experimental before Node 24 but backported to ^22.17.0, exactly our engines floor; replacing it would add a dependency or a fragile hand-rolled matcher
import { glob } from 'node:fs/promises'
import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { ResolvedMdaicsConfig } from './config.js'

import { errorMessage, MdaicsError } from './errors.js'

/** Source file extensions understood by the pipeline. */
/** Declaration files (`.d.ts`/`.d.mts`/`.d.cts`) are not documentable — they carry no JSDoc. */
const DECLARATION_FILE = /\.d\.(?:ts|mts|cts)$/i
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'] as const
/** One concrete src directory and its sibling output directories. */
export interface ProjectRoot {
  /** Absolute path of the sibling build directory (`<src>/../<rootDistDir>`). */
  distDir: string
  /** Absolute path of the sibling docs directory (`<src>/../<outDirName>`). */
  outDir: string
  /** Absolute, canonical path of the src directory. */
  srcDir: string
}

export type SourceExtension = (typeof SOURCE_EXTENSIONS)[number]

/** One source file belonging to a `ProjectRoot`. */
export interface SourceFile {
  /** Absolute path of the source file. */
  absPath: string
  /** Lower-cased extension, e.g. `.ts`. */
  extension: SourceExtension
  project: ProjectRoot
  /** POSIX-style path of the file relative to its project src dir. */
  relPath: string
}

const GLOB_MAGIC = /[*?[{]/
const IGNORED_PATH_SEGMENTS = new Set(['.git', '.hg', '.svn', 'node_modules'])

/** Collected source files and any non-fatal collection notes. */
export interface CollectResult {
  files: SourceFile[]
  issues: string[]
}

/**
 * Recursively collects the documentable source files of every project,
 * skipping `node_modules`, VCS internals, declaration files and the generated
 * docs directory itself. Returns the files plus any non-fatal notes (e.g.
 * unreadable directories, which are skipped rather than aborting the run).
 *
 * Throws `MdaicsError` `OUTPUT_COLLISION` when two source files would
 * produce the same `.md` path (e.g. `dup.ts` and `dup.mjs`) — that is a hard
 * error, not something to silently overwrite.
 * @param projects - The resolved projects to collect from.
 * @returns The files plus any non-fatal notes (unreadable directories skipped).
 */
export async function collectSourceFiles(projects: readonly ProjectRoot[]): Promise<CollectResult> {
  const files: SourceFile[] = []
  const issues: string[] = []
  for (const project of projects) {
    for (const absPath of await walkFiles(project.srcDir, issues)) {
      const extension = lowerExtension(absPath)
      if (!isSourceExtension(extension)) continue
      if (DECLARATION_FILE.test(absPath)) continue
      const relPath = toPosix(relative(project.srcDir, absPath))
      files.push({ absPath, extension, project, relPath })
    }
  }
  files.sort((a, b) => a.absPath.localeCompare(b.absPath))
  assertNoOutputCollisions(files)
  return { files, issues }
}

/**
 * Narrows a raw extension to `.ts`-family (transpiled before jsdoc).
 * @param extension - The source extension (with leading dot).
 * @returns `true` for `.ts`/`.tsx`/`.mts`/`.cts`.
 */
export function isTypeScriptExtension(extension: SourceExtension): boolean {
  return extension === '.ts' || extension === '.tsx' || extension === '.mts' || extension === '.cts'
}

/**
 * Output path for a source file: `<outDir>/<relPath with .md extension>`.
 * Contained by construction — `relPath` comes from `walkFiles(project.srcDir)`,
 * so it is relative with no `..` ascent.
 * @param file - The source file being written out.
 * @returns The absolute output path for the `.md` file.
 */
export function outputPathFor(file: SourceFile): string {
  const mdRel = file.relPath.replace(/\.[^.]+$/, '.md')
  return resolve(file.project.outDir, mdRel)
}

/**
 * Probes each project's dist folder exactly once. Missing or non-directory
 * dist folders are returned so the run can omit dist pointers and warn.
 * @param projects - The resolved projects to probe.
 * @returns The absolute distDirs that are absent or not directories.
 */
export async function probeMissingDistDirs(projects: readonly ProjectRoot[]): Promise<Set<string>> {
  const missing = new Set<string>()
  for (const project of projects) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from the validated config; no untrusted path
      const stats = await stat(project.distDir)
      if (!stats.isDirectory()) missing.add(project.distDir)
    } catch {
      missing.add(project.distDir)
    }
  }
  return missing
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Expands `config.rootSrcDir` to concrete `ProjectRoot`s.
 * @param config - The resolved config (roots and output directory names).
 * @param cwd - Base directory for relative entries and glob expansion.
 * @throws {MdaicsError} `NO_ROOTS` when nothing matches, `OVERLAPPING_ROOTS`
 *   when one src dir contains another, `INVALID_ROOT` for unreadable/non-dir
 *   entries.
 * @returns The resolved projects (one per src directory).
 */
export async function resolveProjects(config: ResolvedMdaicsConfig, cwd: string): Promise<ProjectRoot[]> {
  const candidates: string[] = []
  for (const entry of config.rootSrcDir) {
    if (GLOB_MAGIC.test(entry)) {
      const matches = await expandGlob(entry, cwd)
      if (matches.length === 0) {
        throw new MdaicsError('NO_ROOTS', `rootSrcDir pattern ${JSON.stringify(entry)} matched no directories in ${cwd}`)
      }
      candidates.push(...matches)
    } else {
      candidates.push(resolve(cwd, entry))
    }
  }

  // Canonicalize (collapses `.`/`..`, resolves symlinks, dedupes case on
  // case-insensitive filesystems via realpath).
  const canonical = new Map<string, string>()
  for (const candidate of candidates) {
    const dir = await requireDirectory(candidate)
    if (!canonical.has(dir)) canonical.set(dir, dir)
  }
  const roots = [...canonical.values()].sort()

  assertNoOverlappingRoots(roots)

  return roots.map((srcDir) => ({
    // rootDistDir/outDirName are schema-validated as contained relative dirs.
    distDir: resolve(dirname(srcDir), config.rootDistDir),
    outDir: resolve(dirname(srcDir), config.outDirName),
    srcDir,
  }))
}

/**
 * POSIX-style relative path (forward slashes).
 * @param path - The path to normalize.
 * @returns The path with forward slashes.
 */
export function toPosix(path: string): string {
  return path.split(sep).join('/')
}

/**
 * Recursively lists files under `dir`, never following directory symlinks.
 * @param dir - The directory to walk.
 * @param issues - Per-run notes accumulator (unreadable directories).
 * @returns The absolute paths of the files found.
 */
export async function walkFiles(dir: string, issues: string[]): Promise<string[]> {
  const out: string[] = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let dirents
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
      dirents = await readdir(current, { withFileTypes: true })
    } catch (cause) {
      // One unreadable directory must not abort the whole run — note and skip.
      issues.push(`cannot read directory ${current}: ${errorMessage(cause)}`)
      continue
    }
    for (const dirent of dirents) {
      if (IGNORED_PATH_SEGMENTS.has(dirent.name) || dirent.name.startsWith('.')) continue
      const full = join(current, dirent.name)
      if (dirent.isDirectory()) stack.push(full)
      else if (dirent.isFile()) out.push(full)
      // symlinks (dirs) are deliberately not followed: avoids cycles
    }
  }
  return out
}

/**
 * Fails the whole run when two files in one project would write the same
 * `.md` — that is a configuration problem, not a rendering failure.
 * @param files - The collected files to check for colliding outputs.
 */
function assertNoOutputCollisions(files: readonly SourceFile[]): void {
  const byOutput = new Map<string, SourceFile[]>()
  for (const file of files) {
    const out = outputPathFor(file)
    const bucket = byOutput.get(out)
    if (bucket === undefined) byOutput.set(out, [file])
    else bucket.push(file)
  }
  for (const [out, group] of byOutput) {
    if (group.length > 1) {
      const names = group.map((f) => f.relPath).join(', ')
      throw new MdaicsError('OUTPUT_COLLISION', `source files ${names} would all produce ${out} — rename one of them`)
    }
  }
}

/**
 * Rejects roots where one src directory is nested inside another.
 * @param roots - The resolved source directories to validate.
 */
function assertNoOverlappingRoots(roots: readonly string[]): void {
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      // eslint-disable-next-line security/detect-object-injection -- i and j are loop counters bounded by roots.length
      const outer = roots[i] as string
      // eslint-disable-next-line security/detect-object-injection -- i and j are loop counters bounded by roots.length
      const inner = roots[j] as string
      const rel = relative(outer, inner)
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
        throw new MdaicsError(
          'OVERLAPPING_ROOTS',
          `rootSrcDir entries overlap: ${JSON.stringify(inner)} is inside ${JSON.stringify(outer)} — document each project exactly once`,
        )
      }
    }
  }
}

/**
 * Expands a glob pattern against `cwd`, returning canonical directory paths.
 * A pattern that matches only files is reported distinctly from one that
 * matches nothing at all.
 * @param pattern - The glob pattern to expand (against `cwd`).
 * @param cwd - Base directory for relative patterns.
 * @returns The matched directories (absolute paths).
 */
async function expandGlob(pattern: string, cwd: string): Promise<string[]> {
  const matches: string[] = []
  for await (const entry of glob(pattern, { cwd, withFileTypes: false })) {
    matches.push(entry)
  }

  const directories: string[] = []
  for (const entry of matches) {
    // Globbing '*' would happily sweep up node_modules; ignore it there.
    const segments = entry.split(/[\\/]/)
    if (segments.some((segment) => IGNORED_PATH_SEGMENTS.has(segment))) continue
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
      const stats = await stat(resolve(cwd, entry))
      if (stats.isDirectory()) directories.push(resolve(cwd, entry))
    } catch {
      // Unreadable or dangling — it stays counted in matches.length; the loop simply skips it.
      continue
    }
  }

  if (directories.length === 0 && matches.length > 0) {
    throw new MdaicsError('NO_ROOTS', `rootSrcDir pattern ${JSON.stringify(pattern)} matched files but no directories in ${cwd}`)
  }
  return directories
}

/**
 * Narrows a raw extension to `SourceExtension`.
 * @param extension - The raw extension to test.
 * @returns `true` for the eight supported source extensions.
 */
function isSourceExtension(extension: string): extension is SourceExtension {
  return (SOURCE_EXTENSIONS as readonly string[]).includes(extension)
}

/**
 * Lower-cased file extension including the dot.
 * @param absPath - Absolute path of the file.
 * @returns The lower-cased extension (with leading dot), or `''` for dotfiles.
 */
function lowerExtension(absPath: string): string {
  const base = basename(absPath)
  const index = base.lastIndexOf('.')
  return index <= 0 ? '' : base.slice(index).toLowerCase()
}

/**
 * Stats `path`, requiring an existing directory; returns its realpath.
 * @param path - The path to check.
 * @returns The canonical (realpath) directory path.
 */
async function requireDirectory(path: string): Promise<string> {
  let stats
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
    stats = await stat(path)
  } catch (cause) {
    throw new MdaicsError('INVALID_ROOT', `rootSrcDir entry not found: ${path}`, { cause })
  }
  if (!stats.isDirectory()) {
    throw new MdaicsError('INVALID_ROOT', `rootSrcDir entry is not a directory: ${path}`)
  }
  /* v8 ignore next 6 — defense in depth: config validation guarantees a plain relative dir name, so this cannot trigger through the public API. */
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
    return await realpath(path)
  } catch {
    return resolve(path)
  }
}
