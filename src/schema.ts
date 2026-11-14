/**
 * Validation schemas for mdocs, built on zod — one place for everything that
 * crosses a trust boundary:
 *
 * - `mdocsConfigSchema` validates `mdocs.config.*` (and inline config).
 * - `parseProcessEnv` validates the `process.env` variables mdocs
 *   reads (always — it never throws; env values are advisory).
 *
 * Everything else (jsdoc's doclet output, the content of the `.js` archives)
 * is internal/parsed data, not a validation target.
 *
 * Error reporting is intentionally "fail with the most context we have": the
 * CLI surfaces `MdocsError` messages verbatim, so messages include the
 * offending key and the received value.
 */
import { z } from 'zod'

import { MdocsError } from './errors.js'

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

/** Relative directory name allowed for `rootDistDir` / `outDirName`. */
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
 * Validates `mdocs.config.*` content. Unknown keys are rejected (an
 * unrecognized key is nearly always a typo'd option).
 */
const mdocsConfigSchema = z.strictObject({
  outDirName: relativeDirName.optional(),
  parallelism: z.union([z.boolean(), z.number().int().min(1).max(1024)]).optional(),
  rootDistDir: relativeDirName.optional(),
  rootSrcDir: z
    .union(
      [
        rootSrcDirEntry,
        z.array(rootSrcDirEntry).min(1, 'rootSrcDir must contain at least one path').max(MAX_ROOTS, `rootSrcDir has too many entries (max ${String(MAX_ROOTS)})`),
      ],
      { error: () => 'must be a string or an array of non-empty strings' },
    )
    .optional(),
})

export type MdocsConfigInput = z.output<typeof mdocsConfigSchema>

/**
 * Parses `input` (config file content) into a validated object, throwing
 * `MdocsError` with a message that names every offending key.
 * @param input - The unvalidated config input.
 * @returns The validated config (all keys optional).
 */
export function parseMdocsConfig(input: unknown): MdocsConfigInput {
  const result = mdocsConfigSchema.safeParse(input)
  if (result.success) return result.data
  throw new MdocsError('INVALID_CONFIG', formatIssues(result.error))
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
      parts.push(`unknown config key(s): ${issue.keys.join(', ')}. Allowed keys: rootSrcDir, rootDistDir, outDirName, parallelism`)
      continue
    }
    const path = issue.path.join('.')
    parts.push(path === '' ? issue.message : `${path}: ${issue.message}`)
  }
  return parts.join('; ')
}

const nodeEnvSchema = z.enum(['development', 'test', 'production'])
const flagSchema = z.string()

/** The subset of `process.env` mdocs reads, validated and typed. */
export interface ProcessEnv {
  /** `MDOCS_DEBUG` — truthy values enable stack traces in CLI errors. */
  debug: boolean
  /** NO_COLOR flag (1|true|yes|on, case-insensitive). Accepted but unused; see README. */
  noColor: boolean
  /** `NODE_ENV` when it is one of development|test|production, else absent. */
  nodeEnv?: 'development' | 'production' | 'test'
}

/**
 * Validates the environment variables mdocs consumes. Never throws: unknown
 * variables are ignored and invalid values fall back to safe defaults.
 * @param env - The raw environment (missing keys fall back to defaults).
 * @returns The parsed `NODE_ENV` value.
 */
export function parseProcessEnv(env: NodeJS.ProcessEnv = process.env): ProcessEnv {
  const nodeEnv = nodeEnvSchema.safeParse(env['NODE_ENV'])
  const debug = flagSchema.safeParse(env['MDOCS_DEBUG'])
  const noColor = flagSchema.safeParse(env['NO_COLOR'])
  return {
    ...(nodeEnv.success ? { nodeEnv: nodeEnv.data } : {}),
    debug: debug.success && envFlag(debug.data),
    noColor: noColor.success && envFlag(noColor.data),
  }
}
