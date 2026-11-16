/**
 * Shared helpers for the benchmark suites in `test/bench/`.
 *
 * Kept deliberately small and free of `vitest` imports so both suites
 * (latency and memory) use the same corpus generator and report formatter.
 * Everything here is stdlib I/O or printing — no benchmark bodies live in
 * this file.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'

/** Inclusive upper bound for the synthetic corpus size (guards disk/DoS). */
export const MAX_BENCH_FILES = 1024

/** Default corpus size used when `MDAICS_BENCH_FILES` is unset. */
export const DEFAULT_BENCH_FILES = 120

/**
 * Parses `MDAICS_BENCH_FILES` into a validated file count.
 * @returns The requested corpus size, clamped to [1, MAX_BENCH_FILES].
 * @throws {RangeError} When the variable is set but not a positive integer.
 */
export function benchFileCount(): number {
  const raw = process.env['MDAICS_BENCH_FILES']
  if (raw === undefined) return DEFAULT_BENCH_FILES
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RangeError(`MDAICS_BENCH_FILES must be a positive integer, got "${raw}"`)
  }
  return Math.min(parsed, MAX_BENCH_FILES)
}

/**
 * One deterministic JSDoc-heavy TypeScript module for the bench corpus.
 * `__I__` is the numeric index, `__P__` the zero-padded one. Kept minimal
 * but covering the shapes that cost real work in the pipeline: documented
 * functions with `@param`/`@returns`/`@template`, a class with a constructor,
 * a get accessor, a method with a destructured parameter, an interface with
 * an optional string-literal union, and one intentionally undocumented
 * export (the graceful-skip path).
 */
const TEMPLATE = `/** Bench sample __P__ — synthetic mdaics benchmark corpus file. Do not edit. */

/**
 * @param a - first addend
 * @param b - second addend
 * @returns sum of \`a\` and \`b\`
 */
export function add__I__(a: number, b: number): number { return a + b; }

/**
 * @template T - element type
 * @param items - list to scan
 * @param keep - optional predicate, defaults to always-true
 * @returns first match, or \`undefined\`
 */
export function pick__I__<T>(items: T[], keep?: (x: T) => boolean): T | undefined {
  return items.find(keep ?? (() => true));
}

/** A 2D vector. */
export class Vector__I__ {
  /**
   * @param x - horizontal component
   * @param y - vertical component
   */
  constructor(public x: number, public y: number) {}

  /** @returns the euclidean length */
  get length(): number { return Math.hypot(this.x, this.y); }

  /**
   * @param other - vector to add
   * @returns a new summed vector
   */
  add(other: Vector__I__): Vector__I__ { return new Vector__I__(this.x + other.x, this.y + other.y); }

  /**
   * @param options - rotation options
   * @param options.angle - radians to rotate by
   * @param options.scale - uniform scale, defaults to 1
   * @returns a new rotated vector
   */
  rotate({ angle, scale = 1 }: { angle: number; scale?: number }): Vector__I__ {
    const c = Math.cos(angle) * scale
    const s = Math.sin(angle) * scale
    return new Vector__I__(this.x * c - this.y * s, this.x * s + this.y * c)
  }
}

/** Tagged score: optional string-literal union under the checker. */
export interface Score__I__ { value: number; tag?: 'ok' | 'warn' }

// Intentionally undocumented: exercises the skip path; never add JSDoc here.
export const marker__I__ = 'bench-__P__';
`

/** A temporary benchmark corpus: `<rootDir>/src/*.ts`, torn down by the caller. */
export interface BenchCorpus {
  /** Absolute path of the mkdtemp root (parent of `srcDir`). */
  readonly rootDir: string
  /** Absolute path of the `src/` directory holding the corpus files. */
  readonly srcDir: string
}

/**
 * Creates a fresh corpus: `rootDir/src/sample-*.ts` under a `mkdtemp`
 * directory. The caller must call {@link removeBenchCorpus} afterwards
 * (in `afterAll` / `finally`), never rely on process exit.
 * @param count - Number of files to generate; defaults to `benchFileCount()`.
 * @returns The corpus paths.
 */
export async function createBenchCorpus(count: number = benchFileCount()): Promise<BenchCorpus> {

  const rootDir = await mkdtemp(join(tmpdir(), 'mdaics-bench-'))
  const srcDir = join(rootDir, 'src')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path sits under the caller-owned mkdtemp root
  await mkdir(srcDir, { recursive: true })
  try {
    await generateCorpus(srcDir, count)
  } catch (error) {
    await rm(rootDir, { force: true, recursive: true })
    throw error
  }
  return { rootDir, srcDir }
}

/**
 * Writes `count` deterministic corpus files into `srcDir` (created by the
 * caller, resolved under a caller-owned `mkdtemp` directory).
 * @param srcDir - Absolute path of the target directory (exists, 0700); files are written 0600.
 * @param count - Number of files to write.
 */
export async function generateCorpus(srcDir: string, count: number): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BENCH_FILES) {
    throw new RangeError(`count must be an integer in [1, ${String(MAX_BENCH_FILES)}], got ${String(count)}`)
  }
  await Promise.all(
    Array.from({ length: count }, (_unused, index) => {
      const id = String(index)
      const pad = id.padStart(4, '0')
      const content = TEMPLATE.replaceAll('__I__', id).replaceAll('__P__', pad)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- srcDir is a caller-owned mkdtemp directory; the filename is a fixed suffix
      return writeFile(join(srcDir, `sample-${pad}.ts`), content, { encoding: 'utf8', mode: 0o600 })
    }),
  )
}

/**
 * Prints a one-line environment fingerprint so bench output is
 * interpretable across machines.
 * @param label - What the following measurements are.
 */
export function printFingerprint(label: string): void {
  const [firstCpu] = cpus()
  console.info(
    `# ${label} | node ${process.version} | ${process.platform}-${process.arch} | ` +
      `${firstCpu?.model ?? 'unknown cpu'} x${String(cpus().length)} | ` +
      `NODE_OPTIONS=${process.env['NODE_OPTIONS'] ?? '(unset)'} | MDAICS_BENCH_FILES=${String(benchFileCount())}`,
  )
}

/**
 * Prints a padded plain-text table (header + rows) to stdout.
 * @param headers - Column titles (units belong in the titles).
 * @param rows - One array of cells per row; cells are stringified.
 */
export function printTable(headers: readonly string[], rows: readonly (readonly (number | string)[])[]): void {
  const cells = [headers.map(String), ...rows.map((row) => row.map(String))]
  const widths = headers.map((_header, column) => {
    // eslint-disable-next-line security/detect-object-injection -- column indexes row arrays in lockstep with `headers`
    return Math.max(...cells.map((row) => row[column]?.length ?? 0))
  })
  for (const row of cells) {
    console.info(row.map((cell, column) => {
      // eslint-disable-next-line security/detect-object-injection -- column indexes widths in lockstep with `headers`
      const width = widths[column] ?? 0
      return cell.padEnd(width)
    }).join('  ').trimEnd())
  }
}

/**
 * Removes a corpus created by {@link createBenchCorpus}.
 * @param rootDir - The `rootDir` returned by `createBenchCorpus`.
 */
export async function removeBenchCorpus(rootDir: string): Promise<void> {

  await rm(rootDir, { force: true, recursive: true })
}

/**
 * Runs the GC a few times and yields to the event loop, giving semi-space
 * time to collect before a memory snapshot. No-op (other than the yield)
 * when the process was started without `--expose-gc`.
 */
export async function settle(): Promise<void> {
  const gc = (globalThis as { gc?: () => void }).gc
  for (let round = 0; round < 3; round += 1) gc?.()
  await new Promise((resolve) => setImmediate(resolve))
}
