/**
 * Test-only helpers (excluded from the published build via
 * tsconfig and from public API by living outside `index.ts`).
 */
import { ensureDirectory } from 'jutilities/node/fs/dir'
import { readFile, writeFile } from 'node:fs/promises'

import { isMdaicsError, type MdaicsError } from './errors.js'

/**
 * Asserts that `fn` throws an `MdaicsError`, returning it for further
 * assertions. Re-throws the original error untouched when it is not an
 * `MdaicsError`, so unexpected failure modes stay loud.
 * @param fn - The function expected to throw an `MdaicsError`.
 * @returns The `MdaicsError` it threw.
 */
export async function expectMdaicsError(fn: () => unknown): Promise<MdaicsError> {
  try {
    await fn()
    throw new Error('expected the function to throw an MdaicsError')
  } catch (error) {
    if (!isMdaicsError(error)) throw error
    return error
  }
}

/**
 * `mkdir` with `recursive: true` always (tests only create fixture trees) —
 * delegated to jutilities' `ensureDirectory`.
 * @param path - The directory to create.
 * @returns Nothing.
 */
export async function mkdirp(path: string): Promise<void> {
  await ensureDirectory({ directory: path })
}

/**
 * `readFile` pinned to utf8.
 * @param path - The file to read.
 * @returns The file contents as a utf8 string.
 */
export async function readUtf8(path: string): Promise<string> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tests run inside mkdtemp fixture dirs; paths never escape them
  return readFile(path, 'utf8')
}

/**
 * `writeFile` pinned to utf8 — tests only ever write source text.
 * @param path - The file to write.
 * @param data - The utf8 content to write.
 * @returns Nothing.
 */
export async function writeUtf8(path: string, data: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tests run inside mkdtemp fixture dirs; paths never escape them
  await writeFile(path, data, { encoding: 'utf8' })
}
