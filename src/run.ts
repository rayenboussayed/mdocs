/**
 * The mdocs pipeline, end to end:
 *
 *   load config → resolve project roots (regular repo + monorepo) → collect
 *   source files → transpile/copy into a scratch dir → jsdoc → enrich with
 *   checker types and src/dist pointers → render per file → write `*.md`.
 *
 * `run()` is the programmatic API used by both the CLI and library consumers.
 * It never calls `process.exit`; failures are reported in the result.
 */
import { ensureDirectory } from 'jutilities/node/fs/dir'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { performance } from 'node:perf_hooks'

import { loadConfig, type MdocsConfig } from './config.js'
import { errorMessage } from './errors.js'
import { mapPool } from './pool.js'
import { renderSourceFile, writeTemplatePartials } from './render.js'
import { collectSourceFiles, isTypeScriptExtension, outputPathFor, probeMissingDistDirs, resolveProjects, type SourceFile } from './resolve.js'
import { withScratch } from './scratch.js'
import { createTypeProgram } from './tscheck.js'

/** Per-project summary. */
export interface ProjectSummary {
  distDir: string
  fileCount: number
  outDir: string
  srcDir: string
}

/** Options for one mdocs run. Config keys are merged over the config file. */
export interface RunOptions extends MdocsConfig {
  /** Explicit config file path (beats auto-discovery). */
  configPath?: string
  /** Working directory for config lookup and relative roots. Default: `process.cwd()`. */
  cwd?: string
  /** Collect the planned writes without writing or invoking jsdoc. */
  dryRun?: boolean
}

/** What happened in one run. */
export interface RunResult {
  /** Config file used, or `undefined` when running on defaults. */
  configPath?: string
  cwd: string
  /** `true` when `dryRun` was requested — nothing was written. */
  dryRun: boolean
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** Per-file failures (the run continues past them). */
  failed: Array<{ error: string; file: string; }>
  /** Non-fatal notes (approximations, …). */
  issues: Array<{ file: string; issue: string }>
  projects: ProjectSummary[]
  /** Files intentionally skipped (no JSDoc). */
  skipped: string[]
  /** Non-fatal run-level warnings (e.g. a missing dist folder) — the CLI prints these on stderr. */
  warnings: string[]
  /** Files rendered (absolute `.md` output paths) — or the plan in dry-run. */
  written: Array<{ from: string; symbols: number; to: string; }>
}

/**
 * Executes the full pipeline. Resolves to a `RunResult`; throws only
 * for hard errors (config invalid, roots missing or overlapping).
 * @param options - Run options (cwd, config path, dry-run, inline config keys).
 * @returns The run result — written/skipped/failed files, notes, timings.
 */
export async function run(options: RunOptions = {}): Promise<RunResult> {
  const startedAt = performance.now()
  const cwd = options.cwd ?? process.cwd()
  // Run-only flags (cwd/dryRun/configPath) are not config keys — zod rejects
  // unknown keys, so keep them out of the inline override.
  const { configPath, dryRun = false, ...inlineConfig } = options
  delete inlineConfig.cwd

  // The jsdoc child honors JSDOC_PATH — do not let the environment relocate the parser.
  delete process.env['JSDOC_PATH']

  const { config, filePath } = await loadConfig(cwd, configPath, inlineConfig)
  const projects = await resolveProjects(config, cwd)
  const { files, issues: collectionIssues } = await collectSourceFiles(projects)
  const projectSummaries = projects.map((project) => ({
    distDir: project.distDir,
    fileCount: files.filter((file) => file.project === project).length,
    outDir: project.outDir,
    srcDir: project.srcDir,
  }))

  // Dry-run: resolve the plan and stop — no scratch, no jsdoc, no writes.
  if (dryRun) {
    const planned = files.map((file) => ({ from: file.absPath, symbols: 0, to: outputPathFor(file) }))
    return {
      cwd,
      ...(filePath !== undefined ? { configPath: filePath } : {}),
      dryRun: true,
      durationMs: performance.now() - startedAt,
      failed: [],
      issues: collectionIssues.map((issue) => ({ file: '(collect)', issue })),
      projects: projectSummaries,
      skipped: [],
      warnings: [],
      written: planned,
    }
  }

  // Probe each project's dist folder once — a missing folder means the dist
  // pointer is omitted everywhere in that project (with a single warning).
  const missingDistDirs = await probeMissingDistDirs(projects)
  const distWarnings: string[] = []
  for (const project of projects) {
    if (!missingDistDirs.has(project.distDir)) continue
    distWarnings.push(`dist folder not found: ${project.distDir} — build first; dist: pointers omitted for the project`)
  }

  return withScratch(async (scratch) => {
    const partials = await writeTemplatePartials(scratch.dir)
    const tsFiles = files.filter((file) => isTypeScriptExtension(file.extension)).map((file) => file.absPath)
    const typeProgram = createTypeProgram(tsFiles)

    const results = await mapPool(files, config.parallelism, async (file, index) => {
      try {
        const outPath = outputPathFor(file)
        const result = await renderSourceFile(
          { file, index },
          // Pointers are rendered relative to the run's cwd (the workspace root).
          { missingDistDirs, outPath, partials, pointerBase: cwd, scratchDir: scratch.dir, typeProgram },
        )
        // Render and persist in one task: the write overlaps with the other
        // workers instead of serializing after the pool drains.
        if (result.error === undefined && result.skipped === undefined && result.markdown !== undefined) {
          try {
            // markdown is narrowed to string here; drop the buffer after the write
            await writeMarkdown({ markdown: result.markdown, outPath: result.outPath })
            delete result.markdown
          } catch (cause) {
            result.error = errorMessage(cause)
          }
        }
        return result
      } catch (cause) {
        /* v8 ignore start — defense in depth: outputPathFor/renderSourceFile/writeMarkdown already catch their own failures; this catches nothing reachable through the public API. */
        return {
          error: errorMessage(cause),
          file,
          issues: [] as string[],
          outPath: tryOutputPath(file),
          symbols: 0,
        }
        /* v8 ignore stop */
      }
    })

    const written: RunResult['written'] = []
    const skipped: string[] = []
    const failed: RunResult['failed'] = []
    const issues: RunResult['issues'] = [
      ...collectionIssues.map((issue) => ({ file: '(collect)', issue })),
      // One entry per missing project folder, mirroring the run-level warning.
      ...distWarnings.map((issue) => ({ file: '(dist)', issue })),
    ]

    for (const result of results) {
      for (const issue of result.issues) issues.push({ file: result.file.absPath, issue })

      if (result.error !== undefined) {
        failed.push({ error: result.error, file: result.file.absPath })
        continue
      }
      if (result.skipped === 'no-jsdoc' || result.symbols === 0) {
        skipped.push(result.file.absPath)
        continue
      }
      written.push({ from: result.file.absPath, symbols: result.symbols, to: result.outPath })
    }

    return {
      cwd,
      ...(filePath !== undefined ? { configPath: filePath } : {}),
      dryRun: false,
      durationMs: performance.now() - startedAt,
      failed,
      issues,
      projects: projectSummaries,
      skipped,
      warnings: distWarnings,
      written,
    }
  })
}

/* v8 ignore start — unreachable by design: `outputPathFor` only throws on a relPath escaping the root, which `walkFiles` never yields. */
/**
 * Best-effort `outputPathFor` for the unreachable-error path.
 * @param file - The source file whose planned output path is wanted.
 * @returns The planned output path, or `<unresolved>` when it cannot be computed.
 */
function tryOutputPath(file: SourceFile): string {
  try {
    return outputPathFor(file)
  } catch {
    // Give up on the out path — the error message carries the detail.
    return '<unresolved>'
  }
}
/* v8 ignore stop */

/**
 * Writes one rendered markdown file.
 * @param target - The file to write.
 * @param target.outPath - Absolute destination of the markdown.
 * @param target.markdown - The markdown content.
 * @returns Nothing.
 */
async function writeMarkdown(target: { markdown: string; outPath: string; }): Promise<void> {
  await ensureDirectory({ directory: dirname(target.outPath) })
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
  await writeFile(target.outPath, target.markdown, { encoding: 'utf8', mode: 0o644 })
}
