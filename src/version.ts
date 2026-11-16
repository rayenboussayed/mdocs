/**
 * The mdaics package version, read from the shipped `package.json`.
 *
 * Used by the CLI (`--version`) and by the render cache's toolchain
 * fingerprint — a version bump always invalidates cached renders.
 */
import { readFileSync } from 'node:fs'

/**
 * Reads the mdaics package version from the packaged `package.json`.
 * @returns The version, or `0.0.0-unknown` when it is unreadable.
 */
export function packageVersion(): string {
  try {
    const url = new URL('../package.json', import.meta.url)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the module URL of the published package; no untrusted path
    const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version?: unknown }
    /* v8 ignore start — the published package always carries a package.json with a string version; the "0.0.0-unknown" arm is unreachable in every supported layout. */
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0-unknown'
    /* v8 ignore stop */
  } catch {
    /* v8 ignore next 1 — the shipped package always carries a readable package.json; this is only the never-reachable failure lane. */
    return '0.0.0-unknown'
  }
}
