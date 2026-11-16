/**
 * Memory footprint scenarios for the mdaics pipeline.
 *
 * NOT part of `npm test` — run with `npm run bench:memory` (add
 * `NODE_OPTIONS=--expose-gc` for meaningful heap numbers; the npm script
 * sets it). Nothing here asserts an absolute megabyte or second figure:
 * they are machine-dependent. Assertions cover only structural sanity
 * (finite, monotonic-ish, no failed files) — every measured number is
 * printed for a human to read.
 *
 * What is actually covered, in order:
 *   A. Baseline after module import (the worker's own floor).
 *   B. createTypeProgram over 20 corpus files, retained delta after GC.
 *   C. A full run() over the corpus — this spawns one jsdoc child per
 *      file. The parent-process rows cover orchestration only; jsdoc
 *      children are invisible to memoryUsage().
 *   D. Retained heap across repeated collectSourceFiles calls (leak smoke,
 *      informational only).
 *
 * Caveats printed in the footer apply: maxRSS is cumulative since process
 * start, never a per-scenario peak; GC makes heapUsed a lower bound.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'

import { resolveConfig } from '../../src/config.js'
import { collectSourceFiles, resolveProjects } from '../../src/resolve.js'
import { run } from '../../src/run.js'
import { createTypeProgram } from '../../src/tscheck.js'
import { type BenchCorpus, benchFileCount, createBenchCorpus, printFingerprint, printTable, removeBenchCorpus, settle } from './helpers.js'

const CORPUS_FILES = benchFileCount()
const PROGRAM_FILES = 20

/** One memory sample in MB. `maxRSS` is cumulative since process start. */
interface MemorySample {
  readonly heapUsed: number
  readonly maxRSS: number
  readonly rss: number
}

/**
 * Formats a delta with sign, one decimal.
 * @param value - The after value (MB).
 * @param baseline - The before value (MB).
 * @returns The signed delta, e.g. `+12.3`.
 */
function delta(value: number, baseline: number): string {
  const diff = value - baseline
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`
}

/**
 * Snapshots the current memory usage (MB).
 * @returns The current memory sample.
 */
function snapshot(): MemorySample {
  const { heapUsed, rss } = process.memoryUsage()
  return {
    heapUsed: heapUsed / 1024 / 1024,
    maxRSS: process.resourceUsage().maxRSS / 1024,
    rss: rss / 1024 / 1024,
  }
}

const rows: string[][] = []
let corpus: BenchCorpus | undefined

/**
 * The corpus created by `beforeAll`. Test bodies only run after it, but the
 * runtime makes no guarantee — narrow explicitly instead of casting.
 * @returns The corpus paths.
 */
function requireCorpus(): BenchCorpus {
  if (corpus === undefined) throw new Error('bench corpus was not created')
  return corpus
}

beforeAll(async () => {
  const floor = snapshot()
  printFingerprint('mdaics memory bench')
  console.info(`worker floor after imports (rss/heapUsed): ${floor.rss.toFixed(1)} / ${floor.heapUsed.toFixed(1)} MB`)
  corpus = await createBenchCorpus(CORPUS_FILES)
  await settle()
})

afterAll(async () => {
  if (corpus === undefined) return
  printTable(['scenario', 'rssΔ MB', 'heapΔ MB', 'maxRSS@end MB', 'dur s'], rows)
  console.info('caveats:')
  console.info('  maxRSS is cumulative since process start (high-water mark), never a per-scenario peak')
  console.info('  scenario C covers the parent worker only — jsdoc children are invisible to memoryUsage()')
  console.info('  heapUsed is a lower bound after GC; ±5-15 MB run-to-run noise is expected')
  console.info('  informational only: no absolute thresholds are asserted or implied')
  await removeBenchCorpus(corpus.rootDir)
})

test('A. baseline after imports (worker floor)', async () => {
  const startedAt = performance.now()
  const before = snapshot()
  await settle()
  const after = snapshot()
  const elapsedSeconds = (performance.now() - startedAt) / 1000
  rows.push(['A baseline (after imports)', '0.0', '0.0', after.maxRSS.toFixed(1), elapsedSeconds.toFixed(2)])
  expect(Number.isFinite(after.heapUsed)).toBe(true)
  expect(after.maxRSS).toBeGreaterThanOrEqual(before.maxRSS - 1)
})

test('B. createTypeProgram over 20 corpus files (retained after GC)', async () => {
  await settle()
  const before = snapshot()
  const startedAt = performance.now()
  const config = resolveConfig({ rootSrcDir: ['src'] })
  const projects = await resolveProjects(config, requireCorpus().rootDir)
  const { files } = await collectSourceFiles(projects)
  const subset = files.slice(0, PROGRAM_FILES).map((file) => file.absPath)
  {
    const program = createTypeProgram(subset)
    await settle()
    const after = snapshot()
    const elapsedSeconds = (performance.now() - startedAt) / 1000
    rows.push([
      `B createTypeProgram x${String(subset.length)}`,
      delta(after.rss, before.rss),
      delta(after.heapUsed, before.heapUsed),
      after.maxRSS.toFixed(1),
      elapsedSeconds.toFixed(2),
    ])
    expect(program).not.toBeNull()
  }
  // Program is out of scope now; settle before C so it measures a settled heap.
  await settle()
})

test('C. full run() over the corpus (parent-side footprint)', async () => {
  await settle()
  const before = snapshot()
  const startedAt = performance.now()
  // Cap the pool: at the default (all cores) the jsdoc grandchildren
  // transiently fail with EAGAIN-style errors on saturated machines. The
  // parent-side footprint is queue-dominated, not child-count-dominated, so
  // 8 concurrent children measures the same thing without the flakiness.
  const result = await run({ cwd: requireCorpus().rootDir, parallelism: 8 })
  await settle()
  const after = snapshot()
  const elapsedSeconds = (performance.now() - startedAt) / 1000
  rows.push([
    `C run() x${String(CORPUS_FILES)} (parent)`,
    delta(after.rss, before.rss),
    delta(after.heapUsed, before.heapUsed),
    after.maxRSS.toFixed(1),
    elapsedSeconds.toFixed(2),
  ])
  // Structural: the run itself must have succeeded; memory numbers stay informational.
  expect(result.failed).toEqual([])
  expect(result.written).toHaveLength(CORPUS_FILES)
})

test('D. retained heap across 5 collectSourceFiles passes (leak smoke)', async () => {
  const config = resolveConfig({ rootSrcDir: ['src'] })
  const startedAt = performance.now()
  await settle()
  const before = snapshot()
  for (let round = 0; round < 5; round += 1) {
    const projects = await resolveProjects(config, requireCorpus().rootDir)
    const { files } = await collectSourceFiles(projects)
    expect(files).toHaveLength(CORPUS_FILES)
    await settle()
  }
  const after = snapshot()
  const elapsedSeconds = (performance.now() - startedAt) / 1000
  rows.push([
    'D retained after 5x collect',
    delta(after.rss, before.rss),
    delta(after.heapUsed, before.heapUsed),
    after.maxRSS.toFixed(1),
    elapsedSeconds.toFixed(2),
  ])
  expect(Number.isFinite(after.heapUsed)).toBe(true)
})
