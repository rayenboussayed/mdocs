/**
 * Latency benchmarks for mdocs's hot paths — informational only.
 *
 * These are NOT part of `npm test` and never gate anything: numbers are
 * machine-dependent, so nobody should read a threshold into them. They exist
 * so regressions in the resolve → tscheck → render pipeline are visible to a
 * human comparing two runs (`vitest bench` interleaves nothing; tasks run
 * sequentially with warmup).
 *
 * Run with `npm run bench` (or `npm run bench -- <filter>`). All benchmarks
 * are deterministic in input, consume their results, and build shared state
 * (the synthetic corpus, the fixture maps) outside the timed functions.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { type DmdDoclet, injectCheckerTypes, injectPointers, normalizeDoclets } from '../../src/doclet.js'
import { createLineMapper, readFileSourceMap } from '../../src/lines.js'
import { mapPool } from '../../src/pool.js'
import { collectSourceFiles, type ProjectRoot } from '../../src/resolve.js'
import { run } from '../../src/run.js'
import { createTypeProgram, lookupSymbol, type TypeProgram } from '../../src/tscheck.js'
import { type BenchCorpus, createBenchCorpus, printFingerprint, removeBenchCorpus } from './helpers.js'

/**
 * Vitest's module runner wraps every import binding in a getter; at the
 * sub-microsecond scale of these benchmarks that overhead would dominate.
 * Bind hot imports locally once (the documented mitigation) — the calls are
 * identical, just free of the per-access getter.
 */
const _lookupSymbol = lookupSymbol
const _normalizeDoclets = normalizeDoclets
const _injectCheckerTypes = injectCheckerTypes
const _injectPointers = injectPointers

/** Committed, read-only TS fixture used for program-creation and lookup benches. */
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures', 'regular-repo-ts')
const MATH_TS = join(FIXTURE_DIR, 'src', 'math.ts')
const GEOM_TS = join(FIXTURE_DIR, 'src', 'geometry.ts')
const BROKEN_TS = join(FIXTURE_DIR, 'src', 'broken.ts')
const MATH_MAP = join(FIXTURE_DIR, 'dist', 'math.js.map')
const MATH_JS = join(FIXTURE_DIR, 'dist', 'math.js')

/**
 * Fresh doclets per call — the type-injection benches mutate them in place.
 * @returns Three synthetic doclets (add/clamp/first).
 */
function makeDoclets(): DmdDoclet[] {
  const doclet = (lineno: number, name: string, paramNames: string[]): DmdDoclet => ({
    kind: 'function',
    longname: name,
    meta: { filename: 'math.ts', lineno, path: '/scratch/0' },
    name,
    params: paramNames.map((paramName) => ({ description: paramName, name: paramName })),
  })
  return [
    doclet(8, 'add', ['a', 'b']),
    doclet(19, 'clamp', ['value', 'min', 'max']),
    doclet(29, 'first', ['items']),
  ]
}

/** The shared program for the type-injection benches (fixture read-only). */
const SHARED_PROGRAM: TypeProgram = (() => {
  const program = createTypeProgram([MATH_TS])
  if (program === null) throw new Error('createTypeProgram returned null for the math.ts fixture')
  return program
})()

/** Fresh doclets per call — the pointer/normalize benches mutate them in place. */
const POINTERS = new Map([
  [8, { dist: 'dist/math.js:7', src: 'src/math.ts:8' }],
  [19, { dist: 'dist/math.js:19', src: 'src/math.ts:19' }],
  [29, { dist: 'dist/math.js:28', src: 'src/math.ts:29' }],
])

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
  printFingerprint('mdocs latency bench')
  // Generated once per run; torn down in afterAll. npm run bench
  // re-creates it every time, so it is never a stale committed artifact.
  corpus = await createBenchCorpus()
})

afterAll(async () => {
  if (corpus !== undefined) await removeBenchCorpus(corpus.rootDir)
})

test('createTypeProgram: fixed overhead of the shared TS program', async ({ bench }) => {
  const files = [BROKEN_TS, GEOM_TS, MATH_TS]
  let programSink = 0
  await bench(
    'createTypeProgram (3 fixture files)',
    () => {
      programSink += createTypeProgram(files)?.byFile.size ?? 0
    },
  ).run({ iterations: 4, warmupIterations: 1 })
  expect(programSink).toBeGreaterThan(0)
})

test('collectSourceFiles: fs walk over the synthetic corpus', async ({ bench }) => {
  const roots: ProjectRoot[] = [
    {
      distDir: join(requireCorpus().rootDir, 'dist'),
      outDir: join(requireCorpus().rootDir, 'docs'),
      srcDir: requireCorpus().srcDir,
    },
  ]
  let walkSink = 0
  await bench('collectSourceFiles (corpus)', async () => {
    const { files } = await collectSourceFiles(roots)
    walkSink += files.length
  }).run()
  expect(walkSink).toBeGreaterThan(0)
})

test('createLineMapper: parse the committed fixture sourcemap', async ({ bench }) => {
  const mapJson = readFileSync(MATH_MAP, 'utf8')
  let mapSink = 0
  await bench('createLineMapper (fixture .js.map)', () => {
    const mapper = createLineMapper(mapJson, MATH_MAP, MATH_TS)
    mapSink += mapper.toGenerated(8) ?? 0
  }).run()
  expect(mapSink).toBeGreaterThan(0)
})

test('readFileSourceMap: sibling .js.map fast path', async ({ bench }) => {
  let mapInfoSink = 0
  await bench('readFileSourceMap (fixture .js.map)', async () => {
    const info = await readFileSourceMap(MATH_JS)
    mapInfoSink += info.kind === 'map' ? 1 : 0
  }).run()
  expect(mapInfoSink).toBeGreaterThan(0)
})

test('injectCheckerTypes: per-doclet checker enrichment', async ({ bench }) => {
  let typeSink = 0
  await bench('injectCheckerTypes (3 doclets, shared program)', () => {
    const doclets = makeDoclets()
    _injectCheckerTypes(doclets, SHARED_PROGRAM, MATH_TS)
    typeSink += doclets[0]?.params?.[0]?.type?.names?.[0] === 'number' ? 1 : 0
  }).run()
  expect(typeSink).toBeGreaterThan(0)
})

test('lookupSymbol: the per-doclet lookup (batched)', async ({ bench }) => {
  let lookupSink = 0
  await bench('lookupSymbol x1000 (batch)', () => {
    for (let index = 0; index < 1000; index += 1) {
      lookupSink += _lookupSymbol(SHARED_PROGRAM, MATH_TS, { name: 'add' }) === null ? 0 : 1
    }
  }).run()
  expect(lookupSink).toBeGreaterThan(0)
})

test('mapPool: scheduler overhead baseline', async ({ bench }) => {
  const tasks = Array.from({ length: 2000 }, (_unused, index) => index)
  let poolSink = 0
  await bench('mapPool (2000 no-op tasks, limit 8)', async () => {
    const results = await mapPool(tasks, 8, async () => 1)
    poolSink += results.length
  }).run()
  expect(poolSink).toBeGreaterThan(0)
})

test('normalizeDoclets + injectPointers: per-doclet writes', async ({ bench }) => {
  let pointerSink = 0
  await bench('normalizeDoclets + injectPointers (3 doclets)', () => {
    const doclets = makeDoclets()
    _normalizeDoclets(doclets)
    _injectPointers(doclets, POINTERS)
    pointerSink += doclets[0]?.mdocs !== undefined ? 1 : 0
  }).run()
  expect(pointerSink).toBeGreaterThan(0)
})

test('run({ dryRun: true }): the full plan without jsdoc', async ({ bench }) => {
  let writtenSink = 0
  await bench('run({ dryRun: true }) (macro)', async () => {
    const result = await run({ cwd: requireCorpus().rootDir, dryRun: true })
    writtenSink += result.written.length
  }).run()
  expect(writtenSink).toBeGreaterThan(0)
})
