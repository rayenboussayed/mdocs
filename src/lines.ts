/**
 * Line-number mapping between original sources and generated output, built on
 * `@jridgewell/trace-mapping`.
 *
 * Two flavors of map are used at runtime:
 *
 * - the map of our own in-memory `ts.transpileModule` emit (exact, and the
 *   only map available when the project was not built yet), and
 * - the committed `*.js.map` sitting next to the user's `dist/*.js` (the
 *   reader pointer mdaics advertises in the docs).
 *
 * All line numbers are 1-based throughout the public API. Mapping failures
 * never throw — they yield `null`, and callers fall back to an `(approx.)`
 * marker in the output. `trace-mapping`'s position lookups are column
 * sensitive, so indexes are built from `eachMapping` (which iterates in
 * generated order and yields 1-based lines) instead of the higher-level
 * position helpers.
 */
import { eachMapping, TraceMap } from '@jridgewell/trace-mapping'
import { open } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Outcome of looking up a dist file's sourcemap. */
export type DistMapInfo =
  | { kind: 'map'; mapJson: string; mapUrl: string }
  | { kind: 'no-dist' } // the dist .js is missing or unreadable
  | { kind: 'no-map' } // the dist .js exists but no usable sourcemap was found

/** Maps 1-based lines between a generated file (dist) and its original (src). */
export interface SourceLineMapper {
  /** Generated 1-based line for an original 1-based line, or `null` when unknown. */
  toGenerated(originalLine: number): null | number
  /** Original 1-based line for a generated 1-based line, or `null` when unknown. */
  toOriginal(generatedLine: number): null | number
}

/**
 * Builds a line mapper from a sourcemap JSON string.
 * @param mapJson - Raw `*.js.map` / inline sourcemap JSON.
 * @param mapUrl - Location of the map, used to resolve relative `sources`.
 * @param expectSource - Optional absolute path of the original source file.
 *   When set, the map must reference it; otherwise the map is considered
 *   stale or unrelated and every lookup returns `null` — the caller can
 *   then fall back to an approximation instead of publishing misleading
 *   line numbers.
 * @returns The line mapper.
 */
export function createLineMapper(mapJson: string, mapUrl: string, expectSource?: string): SourceLineMapper {
  let trace: TraceMap
  try {
    trace = new TraceMap(JSON.parse(mapJson) as ConstructorParameters<typeof TraceMap>[0], pathToFileURL(mapUrl).href)
  } catch {
    return nullMapper
  }

  const expect = expectSource === undefined ? undefined : normalizeSource(expectSource)
  const sources = trace.resolvedSources.map(normalizeSource)
  const wantedIndexes = new Set<number>()
  const indexBySource = new Map<string, number>()
  for (let index = 0; index < sources.length; index++) {
    // eslint-disable-next-line security/detect-object-injection -- index comes from a bounds-checked loop over the same map
    const source = sources[index] as string
    indexBySource.set(source, index)
    if (expect === undefined || source === expect) wantedIndexes.add(index)
  }
  if (expect !== undefined && wantedIndexes.size === 0) return nullMapper

  // toOriginal: keep the earliest-column segment per generated line.
  // toGenerated: iteration is in generated order, so keep the first hit.
  const toOriginalMap = new Map<number, number>()
  const toGeneratedMap = new Map<number, number>()
  const bestColumn = new Map<number, number>()
  eachMapping(trace, (mapping) => {
    const sourceIndex = mapping.source === null ? undefined : indexBySource.get(normalizeSource(mapping.source))
    if (mapping.source === null || sourceIndex === undefined || !wantedIndexes.has(sourceIndex)) return
    /* v8 ignore next 1 — defensive: decoded segments with a source always carry an original line. */
    if (mapping.originalLine === null) return
    const column = mapping.generatedColumn
    const previous = bestColumn.get(mapping.generatedLine)
    if (previous === undefined || column < previous) {
      bestColumn.set(mapping.generatedLine, column)
      toOriginalMap.set(mapping.generatedLine, mapping.originalLine)
    }
    if (!toGeneratedMap.has(mapping.originalLine)) {
      toGeneratedMap.set(mapping.originalLine, mapping.generatedLine)
    }
  })

  return {
    toGenerated: (originalLine) => (Number.isInteger(originalLine) ? toGeneratedMap.get(originalLine) ?? null : null),
    toOriginal: (generatedLine) => (Number.isInteger(generatedLine) ? toOriginalMap.get(generatedLine) ?? null : null),
  }
}

// A committed dist map is compiler output; anything beyond this is not a
// legitimate sourcemap and is treated as unusable (instead of exhausting memory).
const MAX_MAP_BYTES = 16 * 1024 * 1024

/**
 * Reads the sourcemap for a generated `.js` file. The sibling `<file>.js.map`
 * is the cheap common case and is tried first; only if it is absent do we
 * touch the (potentially large) `.js` file to look for an inline map, and
 * then only its tail.
 * @param jsAbsPath - Absolute path of the generated `.js` file.
 * @returns Which map is available (`map` / `no-map` / `no-dist`).
 */
export async function readFileSourceMap(jsAbsPath: string): Promise<DistMapInfo> {
  const mapPath = `${jsAbsPath}.map`
  try {
    /* eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path */
    const handle = await open(mapPath, 'r')
    try {
      const { size } = await handle.stat()
      if (size > MAX_MAP_BYTES) return { kind: 'no-map' }
      const buffer = Buffer.alloc(size)
      await handle.read(buffer, 0, size, 0)
      return { kind: 'map', mapJson: buffer.toString('utf8'), mapUrl: mapPath }
    } finally {
      await handle.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { kind: 'no-map' }
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
    const handle = await open(jsAbsPath, 'r')
    try {
      const { size } = await handle.stat()
      const length = Math.min(size, 64 * 1024)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, size - length)
      const inline = extractInlineMap(buffer.toString('utf8'))
      return inline === null ? { kind: 'no-map' } : { kind: 'map', mapJson: inline, mapUrl: jsAbsPath }
    } finally {
      await handle.close()
    }
  } catch {
    return { kind: 'no-dist' }
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

// Line mapping for the inline-sourcemap comment marker (`//# sourceMappingURL=`).
const INLINE_MARKER = /\/\/[#@]\s*sourceMappingURL=data:application\/json/

/**
 * Extracts and decodes a base64 inline sourcemap, if present.
 * @param source - The `.js` source text (only the tail is examined).
 * @returns The decoded map JSON, or `null` when no usable inline map exists.
 */
function extractInlineMap(source: string): null | string {
  // The comment lives at the EOF; work on a tail slice so the scan stays linear.
  const tail = source.slice(-64 * 1024)
  const marker = INLINE_MARKER.exec(tail)
  if (marker === null) return null
  // Everything between the marker and `base64,` is an optional `;charset=...` parameter.
  const comma = tail.lastIndexOf('base64,')
  if (comma < marker.index + marker[0].length) return null
  const payload = tail.slice(comma + 'base64,'.length).trim()
  if (payload === '') return null
  return Buffer.from(payload, 'base64').toString('utf8')
}

/**
 * Normalizes a resolved source entry or an absolute path for comparison.
 * File URLs (what `resolve-uri` produces on Windows) are decoded to native
 * paths; separators are unified and trailing slashes trimmed. Comparison is
 * case-insensitive on Windows only.
 * @param source - The absolute path or file URL to normalize.
 * @returns The normalized path (posix separators, no trailing slash).
 */
function normalizeSource(source: string): string {
  let normalized = source
  if (normalized.startsWith('file:')) {
    normalized = tryFileURLToPath(normalized)
  }
  normalized = normalized.split('\\').join('/')
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  /* v8 ignore next 1 — the test suite runs on Linux; win32 paths lowercase for case-insensitive comparison. */
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * Converts a `file:` URL to a filesystem path.
 * @param source - The string to convert.
 * @returns The decoded path, or `source` unchanged when it is not a file URL.
 */
function tryFileURLToPath(source: string): string {
  try {
    return fileURLToPath(source)
  } catch {
    // Not a file URL jsdoc can map — keep it as-is (it will never match an absolute path).
    return source
  }
}

/** A mapper whose lookups always fail — used when the map is unusable. */
const nullMapper: SourceLineMapper = {
  toGenerated: () => null,
  toOriginal: () => null,
}
