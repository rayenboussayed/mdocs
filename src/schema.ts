/**
 * Validation schemas for mdaics, built on zod — one place for everything that
 * crosses a trust boundary:
 *
 * - `mdaicsConfigSchema` validates `mdaics.config.*` (and inline config).
 * - `parseProcessEnv` validates the `process.env` variables mdaics reads.
 * - `parseCacheFile` validates the on-disk render cache (`.mdaicscache`).
 *
 * Everything else (jsdoc's doclet output) is internal/parsed data, not a validation target.
 *
 * Error reporting is intentionally "fail with the most context we have": the
 * CLI surfaces `MdaicsError` messages verbatim, so messages include the
 * offending key and the received value.
 */
import { z } from 'zod'

import { MdaicsError } from './errors.js'

// ---------------------------------------------------------------------------
// config schema
// ---------------------------------------------------------------------------

/** Matches POSIX absolute paths, Windows drive paths and UNC paths. */
const ABSOLUTE_PATH = /^(?:\/|\\\\|[a-z]:[\\/])/i
const INVALID_SEGMENT_CHARS = /[\0<>:"|?*]/
const MAX_DIR_NAME_LENGTH = 512
const MAX_SEGMENT_LENGTH = 255
const MAX_ROOTS = 1024

/**
 * Splits a candidate relative dir name into its meaningful segments.
 * @param value - The candidate relative directory name.
 * @returns The non-trivial path segments (never `.`, never empty).
 */
function dirSegments(value: string): string[] {
  return value.trim().split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.')
}

/**
 * Default values for every configuration key. Single source for the schema
 * `.default()` arguments and the public `DEFAULT_CONFIG` export.
 */
export const DEFAULT_CONFIG = {
  cache: true,
  cachePath: '.mdaicscache',
  outDirName: 'docs',
  parallelism: true,
  rootDistDir: 'dist',
  rootSrcDir: ['src'],
}

/** Relative directory name allowed for `rootDistDir` / `outDirName` / `cachePath`. */
const relativeDirName = z
  .string()
  .trim()
  .max(MAX_DIR_NAME_LENGTH, `must be at most ${String(MAX_DIR_NAME_LENGTH)} characters`)
  .refine((value) => !ABSOLUTE_PATH.test(value.trim()), 'must be a relative path — absolute paths are not allowed')
  .refine((value) => dirSegments(value).length > 0, 'must name a directory')
  .refine((value) => dirSegments(value).every((segment) => segment !== '..'), "must not contain '..'")
  .refine(
    (value) => dirSegments(value).every((segment) => segment.length <= MAX_SEGMENT_LENGTH && !INVALID_SEGMENT_CHARS.test(segment)),
    'contains an invalid path segment (allowed: any character except <>:"|?*, NUL or backslash variations of those)',
  )

/** One src dir: a path or glob pattern (unexpanded here — resolved later). */
const rootSrcDirEntry = z.string().trim().min(1, 'rootSrcDir entries must be non-empty strings')

/**
 * Validates `mdaics.config.*` content. Unknown keys are rejected (an
 * unrecognized key is nearly always a typo'd option).
 */
const mdaicsConfigSchema = z.strictObject({
  cache: z.boolean().default(DEFAULT_CONFIG.cache),
  cachePath: relativeDirName.default(DEFAULT_CONFIG.cachePath),
  outDirName: relativeDirName.default(DEFAULT_CONFIG.outDirName),
  parallelism: z.union([z.boolean(), z.number().int().min(1).max(1024)]).default(DEFAULT_CONFIG.parallelism),
  rootDistDir: relativeDirName.default(DEFAULT_CONFIG.rootDistDir),
  rootSrcDir: z
    .union(
      [
        rootSrcDirEntry,
        z.array(rootSrcDirEntry).min(1, 'rootSrcDir must contain at least one path').max(MAX_ROOTS, `rootSrcDir has too many entries (max ${String(MAX_ROOTS)})`),
      ],
      { error: () => 'must be a string or an array of non-empty strings' },
    )
    .default(DEFAULT_CONFIG.rootSrcDir),
})

export type MdaicsConfigInput = z.input<typeof mdaicsConfigSchema>
export type MdaicsConfigOutput = z.output<typeof mdaicsConfigSchema>

/**
 * Parses `input` (config file content) into a validated object, throwing
 * `MdaicsError` with a message that names every offending key.
 * @param input - The unvalidated config input.
 * @returns The validated config (all keys present; defaults applied).
 */
export function parseMdaicsConfig(input: unknown): MdaicsConfigOutput {
  const result = mdaicsConfigSchema.safeParse(input)
  if (result.success) return result.data
  throw new MdaicsError('INVALID_CONFIG', formatIssues(result.error))
}

/**
 * Truthy interpretation for flag-style environment variables.
 * @param value - The raw env var value.
 * @returns `true` for `1|true|yes|on` (case-insensitive), else `false`.
 */
function envFlag(value: string | undefined): boolean {
  return value !== undefined && /^(?:1|true|yes|on)$/i.test(value.trim())
}

// ---------------------------------------------------------------------------
// process.env schema
// ---------------------------------------------------------------------------

/**
 * Flattens a ZodError into one `key: message` sentence per issue.
 * @param error - The ZodError whose issues are formatted.
 * @returns A single-line, human-readable issue summary.
 */
function formatIssues(error: z.ZodError): string {
  const parts: string[] = []
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      parts.push(`unknown config key(s): ${issue.keys.join(', ')}. Allowed keys: rootSrcDir, rootDistDir, outDirName, parallelism, cache, cachePath`)
      continue
    }
    const path = issue.path.join('.')
    parts.push(path === '' ? issue.message : `${path}: ${issue.message}`)
  }
  return parts.join('; ')
}

const nodeEnvSchema = z.enum(['development', 'test', 'production'])
const flagSchema = z.string()

/** The subset of `process.env` mdaics reads, validated and typed. */
export interface ProcessEnv {
  /** `MDAICS_DEBUG` — truthy values enable stack traces in CLI errors. */
  debug: boolean
  /** NO_COLOR flag (1|true|yes|on, case-insensitive). Accepted but unused; see README. */
  noColor: boolean
  /** `NODE_ENV` when it is one of development|test|production, else absent. */
  nodeEnv?: 'development' | 'production' | 'test'
}

/**
 * Validates the environment variables mdaics consumes. Never throws: unknown
 * variables are ignored and invalid values fall back to safe defaults.
 * @param env - The raw environment (missing keys fall back to defaults).
 * @returns The parsed `NODE_ENV` value.
 */
export function parseProcessEnv(env: NodeJS.ProcessEnv = process.env): ProcessEnv {
  const nodeEnv = nodeEnvSchema.safeParse(env['NODE_ENV'])
  const debug = flagSchema.safeParse(env['MDAICS_DEBUG'])
  const noColor = flagSchema.safeParse(env['NO_COLOR'])
  return {
    ...(nodeEnv.success ? { nodeEnv: nodeEnv.data } : {}),
    debug: debug.success && envFlag(debug.data),
    noColor: noColor.success && envFlag(noColor.data),
  }
}

// ---------------------------------------------------------------------------
// cache schema
// ---------------------------------------------------------------------------

/** Kind discriminator of one cache entry. */
const cacheEntryKind = z.enum(['md', 'tdata'])

/** Cache keys are `<kind>:<cwd-relative posix path>`, e.g. `md:src/cli.ts`. */
const cacheKeySchema = z.string().min(1).max(4096).regex(/^(md|tdata):[^\0]+$/, 'must be "<kind>:<path>"')

/** One cache entry — either a finished render or raw jsdoc template data. */
const cacheEntrySchema = z
  .strictObject({
    /** Raw `jsdoc2md.getTemplateData()` output (tdata entries only). */
    doclets: z.array(z.record(z.string(), z.unknown())).max(10_000).optional(),
    /** Content fingerprint the entry was computed from. */
    fp: z.string().regex(/^[a-f0-9]{64}$/, 'must be a sha256 hex digest'),
    /** Notes the fresh render produced (replayed on tier-1 hits). Always stored — possibly empty. */
    issues: z.array(z.string().max(10_000)).max(1_000),
    kind: cacheEntryKind,
    /** Milliseconds since epoch of the last hit/store — drives LRU eviction. */
    lastUsed: z.number().int().nonnegative(),
    /** The finished markdown (md entries, non-skipped). */
    markdown: z.string().max(2 * 1024 * 1024).optional(),
    /** The source file was intentionally not rendered (no JSDoc). */
    skipped: z.literal('no-jsdoc').optional(),
    symbols: z.number().int().nonnegative(),
  })
  .superRefine((entry, ctx) => {
    if (entry.kind === 'md') {
      if (entry.skipped === undefined && entry.markdown === undefined) {
        ctx.addIssue({ code: 'custom', message: 'md entries need markdown or skipped' })
      }
      if (entry.skipped !== undefined && entry.markdown !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'md entries carry either markdown or skipped, not both' })
      }
      return
    }
    if (entry.doclets === undefined) {
      ctx.addIssue({ code: 'custom', message: 'tdata entries need doclets' })
    }
  })

/** One on-disk render cache (see `cache.js`). */
const cacheFileSchema = z.strictObject({
  entries: z.record(cacheKeySchema, cacheEntrySchema),
  /** Cache format version — bump on incompatible changes. */
  version: z.literal(1),
})
export type CacheFile = z.output<typeof cacheFileSchema>

/**
 * Parses the on-disk cache. Never throws: a corrupt or outdated cache is a
 * cache miss, not a failure — the run simply re-renders.
 * @param input - The parsed JSON (unknown).
 * @returns The validated cache, or `null` when missing/corrupt/unsupported.
 */
export function parseCacheFile(input: unknown): CacheFile | null {
  const result = cacheFileSchema.safeParse(input)
  return result.success ? result.data : null
}
