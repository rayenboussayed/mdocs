/**
 * Lifecycle of the per-run scratch directory used for the transpiled copies
 * of source files (jsdoc cannot parse TypeScript, and we prefer not to feed
 * user paths to jsdoc directly).
 *
 * The directory is created with `mkdtemp` (mode `0700`), each file inside it
 * is written with mode `0600`, and the whole tree is removed in a `finally`
 * block — plus a best-effort cleanup on SIGINT/SIGTERM, where `finally` does
 * not run. Scratch paths contain no user content beyond the source itself.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The scratch directory for one run. All paths inside it are disposable. */
export interface Scratch {
  /** Absolute path of the scratch root. */
  readonly dir: string
}

/**
 * Runs `fn` with a temporary scratch directory, removing it afterwards no
 * matter how `fn` exits.
 * @param fn - The work to run with the scratch directory.
 * @returns The value returned by `fn`.
 */
export async function withScratch<T>(fn: (scratch: Scratch) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-'))
  /* v8 ignore start — rm with force practically never fails; the rejection handler is defensive. */
  const cleanup = (): Promise<void> =>
    rm(dir, { force: true, recursive: true }).then(
      () => undefined,
      () => undefined,
    )
  /* v8 ignore stop */
  // Signal handlers must stay synchronous-looking; they are registered with
  // process.once so re-signals use Node's default behavior afterward. They
  // call process.exit, which cannot be exercised from inside the test
  // process — hence excluded from coverage.
  /* v8 ignore start */
  const onSigInt = (): void =>
    // eslint-disable-next-line n/no-process-exit -- a signal handler must terminate the process now: the default handler was removed, so exiting here is the only honest outcome (tests cover it via e2e)
    void cleanup().finally(() => process.exit(130))
  const onSigTerm = (): void =>
    // eslint-disable-next-line n/no-process-exit -- same as SIGINT: exit code 143 after best-effort scratch cleanup
    void cleanup().finally(() => process.exit(143))
  process.once('SIGINT', onSigInt)
  process.once('SIGTERM', onSigTerm)
  /* v8 ignore stop */

  try {
    return await fn({ dir })
  } finally {
    process.off('SIGINT', onSigInt)
    process.off('SIGTERM', onSigTerm)
    await cleanup()
  }
}
