/**
 * Shared error type for all expected `mdaics` failures.
 *
 * Every failure an average user can plausibly fix (bad config, missing
 * directories, unreadable source files, …) is reported as a `MdaicsError`
 * with a stable machine-readable `code`. Unexpected
 * programming errors are left as plain `Error`s so they surface with a stack
 * trace instead of being masked by a friendly message.
 *
 * Codes (all stable, all thrown by the pipeline in one place):
 *
 * | Code | Thrown by | Meaning |
 * | --- | --- | --- |
 * | `INVALID_CONFIG` | `schema.ts` / `config.ts` | Config fails zod validation (or a config exports a non-plain-object) |
 * | `CONFIG_NOT_FOUND` | `config.ts` | Explicit `--config` path does not exist / is unreadable |
 * | `CONFIG_LOAD_FAILED` | `config.ts` | Config module threw, rejected, or used unsupported syntax |
 * | `NO_ROOTS` | `resolve.ts` | A `rootSrcDir` glob matched no directories |
 * | `INVALID_ROOT` | `resolve.ts` | A resolved root is not a readable directory |
 * | `OVERLAPPING_ROOTS` | `resolve.ts` | One root is nested inside another |
 * | `OUTPUT_COLLISION` | `resolve.ts` | Two files would write the same `.md` |
 * | `RENDER_TIMEOUT` | `render.ts` | jsdoc exceeded the per-file timeout |
 *
 * Errors are stringified into `RunResult.failed[].error` / `RenderFileResult.error`
 * for per-file failures, and thrown for run-fatal ones (`INVALID_CONFIG`,
 * `CONFIG_*`, `NO_ROOTS`, `INVALID_ROOT`, `OVERLAPPING_ROOTS`, `OUTPUT_COLLISION`).
 */
export class MdaicsError extends Error {
  /** Stable machine-readable code, e.g. `CONFIG_NOT_FOUND`, `NO_ROOTS`, `INVALID_CONFIG`. */
  public readonly code: string

  public constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MdaicsError'
    this.code = code
  }
}

/**
 * Stringifies an unknown caught value for diagnostics.
 * @param cause - The caught value (Error, string, number, …).
 * @returns The error message, or the stringified value for non-Errors.
 */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Narrows `error` to `MdaicsError`.
 * @param error - The value to narrow.
 * @returns `true` when `error` is a `MdaicsError`.
 */
export function isMdaicsError(error: unknown): error is MdaicsError {
  return error instanceof MdaicsError
}
