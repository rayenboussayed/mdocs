/**
 * `mdaics` — CLI entry point.
 *
 * The published bin (`dist/cli.js`) gets its `#!/usr/bin/env node` shebang from
 * the build (`npm run build`), not from this file — `src/cli.ts` is not itself
 * executable, and `n/hashbang` enforces exactly that.
 *
 * Exit codes: `0` on success (or dry-run), `1` on any hard error (bad
 * config, missing roots, one or more file failures). Warnings and notes go
 * to stderr; nothing here calls `process.exit` before commander finishes.
 */
import { Command, InvalidArgumentError } from 'commander'

import type { MdaicsConfig } from './config.js'

import { isMdaicsError } from './errors.js'
import { run, type RunOptions, type RunResult } from './run.js'
import { parseProcessEnv } from './schema.js'
import { packageVersion } from './version.js'

const program = new Command()

program
  .name('mdaics')
  .description('Generate one Markdown API doc per source file from JSDoc annotations')
  .version(packageVersion(), '-v, --version', 'print the mdaics version')
  .argument('[rootSrcDir...]', 'source directories to document (globs allowed; overrides the config file)')
  .option('--config <path>', 'path to the mdaics config file (default: mdaics.config.{js,mjs,cjs} in cwd)')
  .option('--root-dist-dir <name>', "name of the build output directory used for the reader pointer (default 'dist')")
  .option('--out-dir-name <name>', "name of the directory to write *.md files into, next to each src folder (default 'docs')")
  .option('--parallelism <value>', 'true (all cores) | false (sequential) | <N> workers (default: true)', parseParallelism)
  .option('--no-cache', 'disable the render cache (default: enabled; the path comes from config `cachePath`)')
  .option('--dry-run', 'print the planned writes without writing anything', false)
  .option('--verbose', 'print resolved settings, per-file writes, skips and notes', false)
  .action(async (roots: string[], options: CliOptions) => {
    process.exitCode = await execute(roots, options)
  })

const debug = parseProcessEnv(process.env).debug

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof InvalidArgumentError) {
    console.error(`mdaics: ${error.message}`)
    process.exitCode = 1
    return
  }
  console.error(`mdaics: unexpected error: ${formatUnexpected(error)}`)
  process.exitCode = 1
})

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

interface CliOptions {
  cache: boolean
  config?: string
  dryRun: boolean
  outDirName?: string
  parallelism?: boolean | number
  rootDistDir?: string
  verbose: boolean
}

/**
 * Runs the pipeline and prints the summary. Returns the exit code.
 * @param roots - Positional `rootSrcDir` arguments from the CLI.
 * @param options - Parsed CLI flags.
 * @returns The process exit code (`0` ok / dry-run, `1` on failure).
 */
async function execute(roots: string[], options: CliOptions): Promise<number> {
  const overrides: MdaicsConfig = {}
  if (roots.length > 0) overrides.rootSrcDir = roots
  if (options.rootDistDir !== undefined) overrides.rootDistDir = options.rootDistDir
  if (options.outDirName !== undefined) overrides.outDirName = options.outDirName
  if (options.parallelism !== undefined) overrides.parallelism = options.parallelism
  if (options.cache === false) overrides.cache = false

  const runOptions: RunOptions = {
    cwd: process.cwd(),
    ...(options.config !== undefined ? { configPath: options.config } : {}),
    ...(options.dryRun ? { dryRun: true } : {}),
    ...overrides,
  }

  let result: RunResult
  try {
    result = await run(runOptions)
  } catch (error) {
    if (isMdaicsError(error)) {
      console.error(`mdaics: ${error.message}`)
    } else if (error instanceof Error) {
      console.error(`mdaics: unexpected error: ${formatUnexpected(error)}`)
    } else {
      console.error(`mdaics: unexpected error: ${String(error)}`)
    }
    return 1
  }

  if (options.verbose) printVerbose(result)
  printSummary(result, options.verbose)
  return result.failed.length > 0 ? 1 : 0
}

/**
 * Formats an unexpected error, honoring MDAICS_DEBUG for stack traces.
 * @param error - The unexpected error to format.
 * @returns The message (plus stack trace when `MDAICS_DEBUG` is set).
 */
function formatUnexpected(error: unknown): string {
  if (debug && error instanceof Error) return error.stack ?? error.message
  if (error instanceof Error) return `${error.message} (set MDAICS_DEBUG=1 for a stack trace)`
  return String(error)
}

/**
 * Parses `--parallelism` into true | false | integer. Range checks live in the config schema.
 * @param value - The raw flag value.
 * @returns `true`, `false`, or the parsed integer.
 */
function parseParallelism(value: string): boolean | number {
  if (value === 'true') return true
  if (value === 'false') return false
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new InvalidArgumentError(`parallelism must be 'true', 'false' or an integer, got ${JSON.stringify(value)}`)
  }
  return parsed
}

/**
 * Prints the one-line summary and the failures, if any.
 * @param result - The run result to summarize.
 * @param verbose - When set, already printed in `printVerbose`; controls the dry-run listing.
 */
function printSummary(result: RunResult, verbose: boolean): void {
  for (const warning of result.warnings) console.error(`mdaics: warning: ${warning}`)
  const { failed, skipped, written } = result
  const seconds = (result.durationMs / 1000).toFixed(2)
  if (result.dryRun) {
    // eslint-disable-next-line deslint/no-prod-console -- a CLI's stdout is its report; stderr is reserved for failures (npm convention)
    console.log(`mdaics (dry-run): ${String(written.length)} file(s) would be written — nothing written (${seconds}s)`)
    if (!verbose) {
      for (const { to } of written) {
        // eslint-disable-next-line deslint/no-prod-console -- a CLI's stdout is its report; stderr is reserved for failures (npm convention)
        console.log(`  would write ${to}`)
      }
    }
  } else if (failed.length === 0) {
    // eslint-disable-next-line deslint/no-prod-console -- a CLI's stdout is its report; stderr is reserved for failures (npm convention)
    console.log(`mdaics: ${String(written.length)} doc(s) written, ${String(skipped.length)} skipped (${seconds}s)`)
  } else {
    console.error(`mdaics: ${String(written.length)} doc(s) written, ${String(skipped.length)} skipped, ${String(failed.length)} FAILED (${seconds}s)`)
    for (const { error, file } of failed) console.error(`  error ${file}: ${error}`)
  }
}

/**
 * Prints resolved settings and per-file details (--verbose).
 * @param result - The run result to print.
 */
function printVerbose(result: RunResult): void {
  const { configPath, projects } = result
  console.error(`config: ${configPath ?? '(none — using defaults)'}`)
  if (result.cache !== undefined) {
    console.error(`cache:  ${result.cache.path} (${String(result.cache.hits)} hit(s), ${String(result.cache.misses)} miss(es))`)
  }
  for (const project of projects) {
    console.error(`  src:      ${project.srcDir}\n  dist:     ${project.distDir}\n  outDir:   ${project.outDir}\n  files:    ${String(project.fileCount)}`)
  }
  for (const { from, to } of result.written) console.error(`  write   ${to}  (from ${from})`)
  for (const file of result.skipped) console.error(`  skipped ${file} (no JSDoc)`)
  for (const { file, issue } of result.issues) console.error(`  note    ${file}: ${issue}`)
}
