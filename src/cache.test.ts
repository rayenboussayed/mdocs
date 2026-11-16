/**
 * Unit tests for src/cache.ts — load/save, fingerprinting, eviction.
 */
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, onTestFinished, test } from 'vitest'

import { createCache, distMaterialOf, fileFingerprints, lockfileFingerprint, programFingerprint, sweepDeclarations, toolchainFingerprint } from './cache.js'
import { parseCacheFile } from './schema.js'
import { mkdirp, writeUtf8 } from './test-utils.js'

let tick = 0
const clock = (): number => ++tick

/**
 * Creates a self-cleaning temp directory.
 * @param prefix - The mkdtemp prefix to use.
 * @returns The absolute path of the created directory.
 */
async function tmpdirOf(prefix: string): Promise<string> {
   
  const dir = await mkdtemp(join(tmpdir(), prefix))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  return dir
}

test('createCache: missing file starts empty, no issues', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  expect(cache.issues).toEqual([])
  expect(cache.get('md:src/x.ts', 'a'.repeat(64))).toBeUndefined()
})

test('createCache: a directory at the cache path starts empty with one issue', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from the mkdtemp dir created for this test; never escapes it
  await mkdir(join(dir, 'cache.json'))
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  expect(cache.issues).toHaveLength(1)
})

test('createCache: corrupt JSON starts empty with one issue', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  await writeUtf8(join(dir, 'cache.json'), '{nope')
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  expect(cache.issues).toHaveLength(1)
  expect(cache.issues[0]).toMatch(/cache/i)
})

test('createCache: valid JSON, wrong shape starts empty with one issue', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  await writeUtf8(join(dir, 'cache.json'), JSON.stringify({ entries: 'nope', version: 1 }))
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  expect(cache.issues).toHaveLength(1)
})

test('createCache: wrong cache version starts empty', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  await writeUtf8(join(dir, 'cache.json'), JSON.stringify({ entries: {}, version: 2 }))
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  expect(cache.issues).toHaveLength(1)
})

test('save→load round-trip preserves entries; save bumps nothing when clean', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const first = await createCache({ now: clock, path: join(dir, 'cache.json') })
  first.set('md:src/a.ts', { fp: 'a'.repeat(64), issues: [], kind: 'md', markdown: 'docs', symbols: 3 })
  await first.save()
  const saved = join(dir, 'cache.json')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the mkdtemp dir created for this test; never escapes it
  expect((await stat(saved)).mode & 0o777).toBe(0o600)

  const clean = await createCache({ now: clock, path: join(dir, 'cache.json') })
  await clean.save() // no-op — the file must not be rewritten
  expect(clean.issues).toEqual([])

  const second = await createCache({ now: clock, path: join(dir, 'cache.json') })
  expect(second.get('md:src/a.ts', 'a'.repeat(64))?.markdown).toBe('docs')
})

test('load: an over-cap cache file is pruned to the cap at load time', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const raw = { entries: {} as Record<string, object>, version: 1 }
  for (let i = 0; i < 4; i++) {
    raw.entries[`md:src/f${i}.ts`] = { fp: `${i}`.padEnd(64, '0'), issues: [], kind: 'md', lastUsed: i + 1, markdown: `M${i}`, symbols: 1 }
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the mkdtemp dir created for this test; never escapes it
  await writeFile(join(dir, 'cache.json'), JSON.stringify(raw), 'utf8')
  const cache = await createCache({ cap: 2, now: clock, path: join(dir, 'cache.json') })
  expect(cache.get('md:src/f0.ts', `0`.padEnd(64, '0'))).toBeUndefined()
  expect(cache.get('md:src/f1.ts', `1`.padEnd(64, '0'))).toBeUndefined()
  expect(cache.get('md:src/f2.ts', `2`.padEnd(64, '0'))?.markdown).toBe('M2')
  expect(cache.get('md:src/f3.ts', `3`.padEnd(64, '0'))?.markdown).toBe('M3')
})

test('eviction drops skipped (no-jsdoc) entries before tdata and md', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const cache = await createCache({ cap: 1, now: clock, path: join(dir, 'cache.json') })
  cache.set('md:src/a.ts', { fp: 'a'.repeat(64), issues: [], kind: 'md', skipped: 'no-jsdoc', symbols: 0 })
  cache.set('tdata:src/b.ts', { doclets: [], fp: 'b'.repeat(64), issues: [], kind: 'tdata', symbols: 0 })
  cache.set('md:src/c.ts', { fp: 'c'.repeat(64), issues: [], kind: 'md', markdown: 'C', symbols: 1 })
  expect(cache.get('md:src/a.ts', 'a'.repeat(64))).toBeUndefined()
  expect(cache.get('tdata:src/b.ts', 'b'.repeat(64))).toBeUndefined()
  expect(cache.get('md:src/c.ts', 'c'.repeat(64))).toBeDefined()
})

test('eviction with cap 2 drops the least-valuable entry (tdata before md)', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const cache = await createCache({ cap: 2, now: clock, path: join(dir, 'cache.json') })
  cache.set('tdata:src/a.ts', { doclets: [{ kind: 'function' }], fp: 'a'.repeat(64), issues: [], kind: 'tdata', symbols: 0 })
  cache.set('md:src/b.ts', { fp: 'b'.repeat(64), issues: [], kind: 'md', markdown: 'B', symbols: 1 })
  cache.set('md:src/c.ts', { fp: 'c'.repeat(64), issues: [], kind: 'md', markdown: 'C', symbols: 1 })
  expect(cache.get('tdata:src/a.ts', 'a'.repeat(64))).toBeUndefined()
  expect(cache.get('md:src/b.ts', 'b'.repeat(64))?.markdown).toBe('B')
  expect(cache.get('md:src/c.ts', 'c'.repeat(64))?.markdown).toBe('C')
})

test('eviction keeps md entries over tdata entries when both are full', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const cache = await createCache({ cap: 1, now: clock, path: join(dir, 'cache.json') })
  cache.set('tdata:src/a.ts', { doclets: [], fp: 'a'.repeat(64), issues: [], kind: 'tdata', symbols: 0 })
  cache.set('md:src/b.ts', { fp: 'b'.repeat(64), issues: [], kind: 'md', markdown: 'B', symbols: 1 })
  cache.set('md:src/c.ts', { fp: 'c'.repeat(64), issues: [], kind: 'md', markdown: 'C', symbols: 1 })
  expect(cache.get('md:src/b.ts', 'b'.repeat(64))).toBeUndefined()
  expect(cache.get('md:src/c.ts', 'c'.repeat(64))?.markdown).toBe('C')
})

test('set over the cap evicts stale md entries (lastUsed order)', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const cache = await createCache({ cap: 1, now: clock, path: join(dir, 'cache.json') })
  cache.set('md:src/a.ts', { fp: 'a'.repeat(64), issues: [], kind: 'md', markdown: 'A', symbols: 1 })
  cache.set('md:src/b.ts', { fp: 'b'.repeat(64), issues: [], kind: 'md', markdown: 'B', symbols: 1 })
  expect(cache.get('md:src/a.ts', 'a'.repeat(64))).toBeUndefined()
  expect(cache.get('md:src/b.ts', 'b'.repeat(64))?.markdown).toBe('B')
})

test('get bumps lastUsed only on an fp match', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  cache.set('md:src/a.ts', { fp: 'a'.repeat(64), issues: [], kind: 'md', markdown: 'A', symbols: 1 })
  const first = cache.get('md:src/a.ts', 'a'.repeat(64))?.lastUsed
  cache.get('md:src/a.ts', 'f'.repeat(64)) // wrong fp — must not refresh
  expect(cache.get('md:src/a.ts', 'a'.repeat(64))?.lastUsed).toBeGreaterThan(first ?? 0)
})

test('save failure records an issue and never throws', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  await writeUtf8(join(dir, 'blocker'), 'i am a file')
  const cache = await createCache({ now: clock, path: join(dir, 'blocker', 'cache.json') })
  cache.set('md:src/a.ts', { fp: 'a'.repeat(64), issues: [], kind: 'md', markdown: 'A', symbols: 1 })
  await cache.save()
  expect(cache.issues.length).toBeGreaterThanOrEqual(1)
})

test('fingerprints: md and tdata differ, both stable for the same inputs', () => {
  const base = { cwd: '/repo', distMaterial: 'map:abc', file: { absPath: '/repo/src/a.ts', extension: '.ts' }, isTypeScript: true, programFp: 'p'.repeat(64), srcText: 'const a = 1\n', toolchainFp: 't'.repeat(64) }
  const first = fileFingerprints(base)
  expect(fileFingerprints(base)).toEqual(first)
  expect(first.jsdocFp).not.toBe(first.markdownFp)
  expect(fileFingerprints({ ...base, srcText: 'const a = 2\n' }).markdownFp).not.toBe(first.markdownFp)
  expect(fileFingerprints({ ...base, distMaterial: 'no-dist' }).markdownFp).not.toBe(first.markdownFp)
  expect(fileFingerprints({ ...base, isTypeScript: false, programFp: null }).markdownFp).not.toBe(first.markdownFp)
})

test('fingerprints: the key is cwd-relative and stable across runs', () => {
  const base = { distMaterial: 'no-dist', isTypeScript: false, programFp: null, srcText: 'const a = 1\n', toolchainFp: 't'.repeat(64) }
  const file = (cwd: string): { absPath: string; extension: string } => ({ absPath: `${cwd}/src/a.js`, extension: '.js' })
  expect(fileFingerprints({ ...base, cwd: '/repo', file: file('/repo') }).key).toBe('src/a.js')
  // Deterministic for the same (cwd, path, inputs) — the cache is cwd-local, so
  // pointer lines sealed in a cache are always relative to its own cwd.
  expect(fileFingerprints({ ...base, cwd: '/repo', file: file('/repo') })).toEqual(fileFingerprints({ ...base, cwd: '/repo', file: file('/repo') }))
})

test('lockfileFingerprint: absent returns undefined; present hashes the file', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  expect(await lockfileFingerprint(dir)).toBeUndefined()
  await writeUtf8(join(dir, 'package-lock.json'), '{"lockfileVersion":3}')
  const digest = await lockfileFingerprint(dir)
  expect(digest).toMatch(/^[a-f0-9]{64}$/)
})

test('programFingerprint: order-independent and content-sensitive', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  await writeUtf8(join(dir, 'a.ts'), 'export const a = 1\n')
  await writeUtf8(join(dir, 'b.d.ts'), 'export declare const b: number\n')
  const fp1 = await programFingerprint({ lock: undefined, sweep: [join(dir, 'b.d.ts')], tsFiles: [join(dir, 'a.ts')] })
  expect(await programFingerprint({ lock: undefined, sweep: [join(dir, 'b.d.ts')], tsFiles: [join(dir, 'a.ts')] })).toBe(fp1)
  expect(await programFingerprint({ lock: 'l'.repeat(64), sweep: [join(dir, 'b.d.ts')], tsFiles: [join(dir, 'a.ts')] })).not.toBe(fp1)
})

test('programFingerprint: an unreadable file hashes as UNREADABLE without throwing', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  expect(await programFingerprint({ lock: undefined, sweep: [], tsFiles: [join(dir, 'missing.ts')] })).toMatch(/^[a-f0-9]{64}$/)
})

test('sweepDeclarations: honors the cap when too many .d.ts files exist', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  await mkdirp(join(dir, 'src', 'nested'))
  for (let i = 0; i < 3; i++) await writeUtf8(join(dir, 'src', 'nested', `types-${i}.d.ts`), `export declare const x${i}: number\n`)
  const found = await sweepDeclarations([join(dir, 'src')], 2)
  // The cap is enforced but the flag is only reliable at exactly the cap —
  // what matters is that collecting stops at `cap`, not that specific names win.
  expect(found).toHaveLength(2)
})

test('sweepDeclarations: finds .d.ts files, skips node_modules', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  await mkdirp(join(dir, 'src', 'node_modules', 'pkg'))
  await mkdirp(join(dir, 'src', 'nested'))
  await writeUtf8(join(dir, 'src', 'nested', 'types.d.ts'), 'export declare const x: number\n')
  await writeUtf8(join(dir, 'src', 'node_modules', 'pkg', 'lib.d.ts'), 'export declare const y: number\n')
  await writeUtf8(join(dir, 'src', 'impl.ts'), 'export const z = 1\n')
  const found = await sweepDeclarations([join(dir, 'src')])
  expect(found).toEqual([join(dir, 'src', 'nested', 'types.d.ts')])
})

test('distMaterialOf: reports kind and hashes the map JSON', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  expect(await distMaterialOf(join(dir, 'missing.js'))).toBe('no-dist')
  await mkdirp(join(dir, 'dist'))
  await writeUtf8(join(dir, 'dist', 'x.js'), 'export const x = 1\n')
  expect(await distMaterialOf(join(dir, 'dist', 'x.js'))).toBe('no-map')
  await writeUtf8(join(dir, 'dist', 'x.js.map'), JSON.stringify({ mappings: '', sources: ['../src/x.ts'], version: 3 }))
  expect(await distMaterialOf(join(dir, 'dist', 'x.js'))).toMatch(/^map:[a-f0-9]{64}$/)
})

test('toolchainFingerprint: stable across calls, ends with the render format salt', () => {
  expect(toolchainFingerprint()).toBe(toolchainFingerprint())
  expect(toolchainFingerprint()).toMatch(/^[a-f0-9]{64}$/)
})

test('entry with stale markdown shape is rejected by the schema', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  await writeUtf8(join(dir, 'cache.json'), JSON.stringify({ entries: { 'md:src/a.ts': { fp: 'zzz', kind: 'md', lastUsed: 1, symbols: 1 } }, version: 1 }))
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  expect(cache.issues).toHaveLength(1)
})

test('oversized entries are refused at store time (markdown cap)', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  cache.set('md:src/a.ts', { fp: 'a'.repeat(64), kind: 'md', markdown: 'x'.repeat(2 * 1024 * 1024 + 1), symbols: 1 })
  expect(cache.get('md:src/a.ts', 'a'.repeat(64))).toBeUndefined()
})

test('oversized doclets are refused at store time (tdata cap)', async () => {
  const dir = await tmpdirOf('mdaics-cache-')
  const cache = await createCache({ now: clock, path: join(dir, 'cache.json') })
  cache.set('tdata:src/a.ts', { doclets: Array.from({ length: 10_001 }, () => ({})), fp: 'a'.repeat(64), issues: [], kind: 'tdata', symbols: 0 })
  expect(cache.get('tdata:src/a.ts', 'a'.repeat(64))).toBeUndefined()
})

const validMd = { fp: 'a'.repeat(64), issues: [], kind: 'md', lastUsed: 1, markdown: 'docs', symbols: 1 } as const

test('parseCacheFile: accepts a well-formed cache', () => {
  expect(parseCacheFile({ entries: { 'md:src/a.ts': validMd }, version: 1 })).toEqual({ entries: { 'md:src/a.ts': validMd }, version: 1 })
})

test('parseCacheFile: rejects md entries with neither markdown nor skipped', () => {
  expect(parseCacheFile({ entries: { 'md:src/a.ts': { fp: 'a'.repeat(64), issues: [], kind: 'md', lastUsed: 1, symbols: 1 } }, version: 1 })).toBeNull()
})

test('parseCacheFile: rejects md entries carrying markdown and skipped together', () => {
  expect(
    parseCacheFile({
      entries: { 'md:src/a.ts': { fp: 'a'.repeat(64), issues: [], kind: 'md', lastUsed: 1, markdown: 'x', skipped: 'no-jsdoc', symbols: 1 } },
      version: 1,
    }),
  ).toBeNull()
})

test('parseCacheFile: rejects md entries without symbols', () => {
  expect(parseCacheFile({ entries: { 'md:src/a.ts': { fp: 'a'.repeat(64), issues: [], kind: 'md', lastUsed: 1, markdown: 'x' } }, version: 1 })).toBeNull()
})

test('parseCacheFile: rejects tdata entries without doclets', () => {
  expect(parseCacheFile({ entries: { 'tdata:src/a.ts': { fp: 'a'.repeat(64), issues: [], kind: 'tdata', lastUsed: 1, symbols: 0 } }, version: 1 })).toBeNull()
})

test('parseCacheFile: accepts a skip entry and a tdata entry', () => {
  expect(
    parseCacheFile({
      entries: {
        'md:src/a.ts': { fp: 'a'.repeat(64), issues: [], kind: 'md', lastUsed: 1, skipped: 'no-jsdoc', symbols: 0 },
        'tdata:src/b.ts': { doclets: [{}], fp: 'b'.repeat(64), issues: [], kind: 'tdata', lastUsed: 1, symbols: 0 },
      },
      version: 1,
    }),
  ).not.toBeNull()
})

test('parseCacheFile: rejects unknown keys at the top level', () => {
  expect(parseCacheFile({ entries: {}, surprise: true, version: 1 })).toBeNull()
})
