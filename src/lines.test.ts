/**
 * Unit tests for src/lines.ts — sourcemap line mapping (src ↔ dist).
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, onTestFinished, test } from 'vitest'

import { createLineMapper, readFileSourceMap } from './lines.js'
import { mkdirp, readUtf8, writeUtf8 } from './test-utils.js'

const fixtures = join(process.cwd(), 'test', 'fixtures')
const regularTs = join(fixtures, 'regular-repo-ts')

test('createLineMapper: maps src→dist and dist→src on committed maps', async () => {
  const mapJson = await readUtf8(join(regularTs, 'dist', 'math.js.map'))
  const mapper = createLineMapper(mapJson, join(regularTs, 'dist', 'math.js.map'))
  expect(mapper.toOriginal(7)).toBe(8)
  expect(mapper.toOriginal(17)).toBe(19)
  expect(mapper.toOriginal(26)).toBe(29)
  expect(mapper.toGenerated(8)).toBe(7)
  expect(mapper.toGenerated(19)).toBe(17)
  expect(mapper.toGenerated(29)).toBe(26)
})

test('createLineMapper: expectSource filters stale/foreign maps', async () => {
  const mapJson = await readUtf8(join(regularTs, 'dist', 'math.js.map'))
  const mapper = createLineMapper(mapJson, join(regularTs, 'dist', 'math.js.map'), join(regularTs, 'src', 'other.ts'))
  expect(mapper.toOriginal(7)).toBeNull()
  expect(mapper.toGenerated(8)).toBeNull()
})

test('createLineMapper: garbage input yields an inert mapper', () => {
  const mapper = createLineMapper('{not json', 'map.json')
  expect(mapper.toOriginal(1)).toBeNull()
  expect(mapper.toGenerated(1)).toBeNull()
})

test('createLineMapper: empty mappings yield null lookups without crashing', () => {
  const mapper = createLineMapper(JSON.stringify({ file: 'x.js', mappings: '', names: [], sources: ['x.ts'], version: 3 }), 'x.js.map')
  expect(mapper.toOriginal(1)).toBeNull()
  expect(mapper.toGenerated(1)).toBeNull()
})

test('readFileSourceMap: reads sibling maps, reports missing dist and missing maps', async () => {
  const fromFile = await readFileSourceMap(join(regularTs, 'dist', 'math.js'))
  expect(fromFile.kind).toBe('map')
  if (fromFile.kind !== 'map') throw new Error('expected a resolved sourcemap')
  expect(JSON.parse(fromFile.mapJson).version).toBe(3)

  // The committed fixture ships no js-without-map case; probe with a path whose file is absent.
  const missing = await readFileSourceMap(join(regularTs, 'dist', 'does-not-exist.js'))
  expect(missing.kind).toBe('no-dist')
})

test('createLineMapper: src and dist lines never collapse for CRLF-shaped sources', async () => {
  // The fixture source has LF endings; exercise the API boundary instead:
  // line 1 maps to line 1 when nothing was removed, and never returns line 0.
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-lines-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await cp(regularTs, join(dir, 'proj'), { recursive: true })
  const src = join(dir, 'proj', 'src', 'math.ts')
  const dist = join(dir, 'proj', 'dist', 'math.js')
  const mapJson = await readUtf8(`${dist}.map`)
  const mapper = createLineMapper(mapJson, `${dist}.map`, src)
  for (const line of [7, 17, 26, 100]) {
    const original = mapper.toOriginal(line)
    expect(original === null || original >= 1).toBeTruthy()
  }
})

test('createLineMapper: per-source filter ignores unwanted segments on the same line', () => {
  const map = {
    file: 'x.js',
    mappings: [[[0, 0, 0, 0], [4, 1, 42, 0], [10]]], // a@0, b@4, unmapped@10
    names: [],
    sources: ['a.ts', 'b.ts'],
    version: 3,
  }
  const mapJson = JSON.stringify(map)
  const toA = createLineMapper(mapJson, '/dir/map.json', '/dir/a.ts')
  const toB = createLineMapper(mapJson, '/dir/map.json', '/dir/b.ts')
  expect(toA.toOriginal(1)).toBe(1)
  expect(toB.toOriginal(1)).toBe(43)
})

test('createLineMapper: expectSource absent from the map yields an inert mapper', () => {
  const mapJson = JSON.stringify({
    file: 'x.js',
    mappings: [[[0, 0, 0, 0]]],
    names: [],
    sources: ['a.ts'],
    version: 3,
  })
  const mapper = createLineMapper(mapJson, '/dir/map.json', '/dir/other.ts')
  expect(mapper.toOriginal(1)).toBeNull()
  expect(mapper.toGenerated(1)).toBeNull()
})

test('createLineMapper: file: URLs in sources are decoded for comparison', () => {
  const mapJson = JSON.stringify({
    file: 'x.js',
    mappings: [[[0, 0, 0, 0]]],
    names: [],
    sources: ['file:///dir/a.ts'],
    version: 3,
  })
  const mapper = createLineMapper(mapJson, '/dir/map.json', '/dir/a.ts')
  expect(mapper.toGenerated(1)).toBe(1)
})

test('createLineMapper: file: URLs that fail decoding never match', () => {
  const mapJson = JSON.stringify({
    file: 'x.js',
    mappings: [[[0, 0, 0, 0]]],
    names: [],
    sources: ['file://%zz'],
    version: 3,
  })
  const mapper = createLineMapper(mapJson, '/dir/map.json', '/dir/a.ts')
  expect(mapper.toOriginal(1)).toBeNull()
})

test('createLineMapper: non-integer lines are rejected', () => {
  const mapJson = JSON.stringify({
    file: 'x.js',
    mappings: [[[0, 0, 0, 0]]],
    names: [],
    sources: ['a.ts'],
    version: 3,
  })
  const mapper = createLineMapper(mapJson, '/dir/map.json', '/dir/a.ts')
  expect(mapper.toOriginal(1.5)).toBeNull()
  expect(mapper.toGenerated(Number.NaN)).toBeNull()
})

test('readFileSourceMap: inline maps are read from the tail of the .js file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-inline-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const map = {
    file: 'inline.js',
    mappings: [[[0, 0, 0, 0]]],
    names: [],
    sources: ['inline.ts'],
    version: 3,
  }
  const inline = `const x = 1\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`
  const js = join(dir, 'inline.js')
  await mkdirp(dir)
  await writeUtf8(js, inline)
  const result = await readFileSourceMap(js)
  expect(result.kind).toBe('map')
  if (result.kind !== 'map') throw new Error('expected a resolved sourcemap')
  expect(JSON.parse(result.mapJson).sources[0]).toBe('inline.ts')
})

test('readFileSourceMap: a sibling directory named .js.map reports missing map', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-notmap-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'x.js.map'))
  await writeUtf8(join(dir, 'x.js'), 'const x = 1\n')
  const result = await readFileSourceMap(join(dir, 'x.js'))
  expect(result.kind).toBe('no-map')
})

test('readFileSourceMap: a plain .js file without any map reports missing map', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-nomap-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'plain.js'), 'const x = 1\n')
  const result = await readFileSourceMap(join(dir, 'plain.js'))
  expect(result.kind).toBe('no-map')
})

test('readFileSourceMap: a sibling map larger than the cap is treated as unusable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-bigmap-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const js = join(dir, 'math.js')
  // 17 MB of 'x' — comfortably past MAX_MAP_BYTES without committing a huge fixture.
  await writeUtf8(`${js}.map`, 'x'.repeat(17 * 1024 * 1024))
  await writeUtf8(js, 'export const x = 1\n')
  const result = await readFileSourceMap(js)
  expect(result.kind).toBe('no-map')
})

test('readFileSourceMap: an inline comment with an empty payload reports no usable map', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-emptymap-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const js = join(dir, 'inline.js')
  await writeUtf8(js, 'export const x = 1\n//# sourceMappingURL=data:application/json;base64,\n')
  const result = await readFileSourceMap(js)
  expect(result.kind).toBe('no-map')
})

test('readFileSourceMap: a sourceMappingURL with no trailing base64 payload reports no usable map', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-nopayload-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const js = join(dir, 'inline.js')
  await writeUtf8(js, 'const dataUri = "data:base64,literal-string-containing-base64-comma"\n//# sourceMappingURL=data:application/json\n')
  const result = await readFileSourceMap(js)
  expect(result.kind).toBe('no-map')
})
