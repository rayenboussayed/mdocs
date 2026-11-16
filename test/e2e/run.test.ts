/**
 * End-to-end tests for src/run.ts — the full pipeline programmatically,
 * against copies of the committed fixtures (fixtures are never polluted).
 */
import { chmod, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, onTestFinished, test } from 'vitest'

import { run } from '../../src/run.js'
import { expectMdocsError, mkdirp, readUtf8, writeUtf8 } from '../../src/test-utils.js'

const fixtures = join(process.cwd(), 'test', 'fixtures')

/**
 *
 * @param fixture - The fixture name to copy (e.g. `regular-repo-ts`).
 * @returns The absolute path of the copied fixture.
 */
async function projectCopy(fixture: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-e2e-'))
  const dest = join(dir, 'proj')
  await cp(join(fixtures, fixture), dest, { recursive: true })
  return dest
}

test('regular-repo-ts: full run generates docs with src/dist pointers and typed params', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await run({ cwd: dir })
  expect(result.failed).toHaveLength(0)
  expect(result.written).toHaveLength(2) // math.ts, geometry.ts
  expect(result.skipped.some((f) => f.endsWith('broken.ts'))).toBeTruthy()

  const mathMd = await readUtf8(join(dir, 'docs', 'math.md'))
  expect(mathMd).toMatch(/math\.ts:8/)
  expect(mathMd).toMatch(/dist\/math\.js:7/)
  expect(mathMd).toMatch(/math\.ts:19/)
  expect(mathMd).toMatch(/math\.ts:29/)
  expect(mathMd).toMatch(/\| a \| <code>number<\/code>/)
  expect(mathMd).toMatch(/\| items \| <code>T\[\]<\/code>/)

  const geometryMd = await readUtf8(join(dir, 'docs', 'geometry.md'))
  expect(geometryMd).toMatch(/new Point\(x, y\)/)
  expect(geometryMd).toMatch(/src: .*geometry\.ts:4/)
  expect(geometryMd).toMatch(/\| x \| <code>number<\/code>/)
})

test('regular-repo-ts: output is byte-identical across parallelism settings and reruns', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const sequential = await run({ cwd: dir, parallelism: false })
  const mathSeq = await readUtf8(join(dir, 'docs', 'math.md'))
  const geometrySeq = await readUtf8(join(dir, 'docs', 'geometry.md'))

  const parallel = await run({ cwd: dir, parallelism: true })
  const mathPar = await readUtf8(join(dir, 'docs', 'math.md'))
  const geometryPar = await readUtf8(join(dir, 'docs', 'geometry.md'))

  expect(mathSeq).toBe(mathPar)
  expect(geometrySeq).toBe(geometryPar)
  expect(sequential.failed).toHaveLength(0)
  expect(parallel.failed).toHaveLength(0)
})

test('monorepo: glob expansion documents every package with its own pointers', async () => {
  const dir = await projectCopy('monorepo')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await run({ cwd: dir, rootSrcDir: ['packages/*/src'] })
  expect(result.failed).toHaveLength(0)
  expect(result.written).toHaveLength(2)

  const alpha = await readUtf8(join(dir, 'packages', 'alpha', 'docs', 'alpha.md'))
  const beta = await readUtf8(join(dir, 'packages', 'beta', 'docs', 'beta.md'))
  expect(alpha).toMatch(/src: .*alpha\.ts:7/)
  expect(alpha).toMatch(/dist: .*alpha\.js:6/)
  expect(beta).toMatch(/src: .*beta\.ts:7/)
  expect(beta).toMatch(/dist: .*beta\.js:6/)
})

test('monorepo: overlapping roots are rejected with both paths', async () => {
  const dir = await projectCopy('monorepo')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const error = await expectMdocsError(() => run({ cwd: dir, rootSrcDir: ['packages', 'packages/alpha/src'] }))
  expect(error.code).toBe('OVERLAPPING_ROOTS')
})

test('monorepo: a glob that matches nothing fails with the pattern', async () => {
  const dir = await projectCopy('monorepo')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const error = await expectMdocsError(() => run({ cwd: dir, rootSrcDir: ['packages/*/nope'] }))
  expect(error.code).toBe('NO_ROOTS')
})

test('no-dist: docs are still generated; dist line omitted, warning and issue recorded', async () => {
  const dir = await projectCopy('no-dist')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await run({ cwd: dir })
  expect(result.failed).toHaveLength(0)
  expect(result.written).toHaveLength(1)
  expect(result.warnings).toHaveLength(1)
  expect(result.warnings[0]).toMatch(/dist folder not found/i)

  const md = await readUtf8(join(dir, 'docs', 'lone.md'))
  expect(md).toMatch(/src: .*lone\.ts:8/)
  expect(md).not.toMatch(/^dist: /m)
  expect(result.issues.filter((issue) => issue.issue.includes('dist folder not found'))).toHaveLength(1)
})

test('dist folder present but the dist file missing suppresses only that file', async () => {
  const dir = await projectCopy('regular-repo-js')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await rm(join(dir, 'dist', 'index.js'), { force: true })

  const result = await run({ cwd: dir })
  expect(result.failed).toHaveLength(0)

  const md = await readUtf8(join(dir, 'docs', 'index.md'))
  expect(md).toMatch(/src: .*index\.js:9/)
  expect(md).not.toMatch(/^dist: /m)
  expect(result.warnings).toEqual([])
  expect(result.issues.filter((issue) => issue.issue.includes('dist file not found'))).toHaveLength(1)
})

test('warm cache: second run hits the cache and writes identical docs', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const first = await run({ cwd: dir, parallelism: false })
  expect(first.cache?.misses).toBe(first.written.length + first.skipped.length)
  const mathBefore = await readUtf8(join(dir, 'docs', 'math.md'))

  const second = await run({ cwd: dir, parallelism: false })
  expect(second.cache?.hits).toBe(second.written.length + second.skipped.length)
  expect(second.cache?.misses).toBe(0)
  expect(await readUtf8(join(dir, 'docs', 'math.md'))).toBe(mathBefore)
})

test('cached markdown restores docs deleted between runs', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  await run({ cwd: dir, parallelism: false })
  await rm(join(dir, 'docs'), { force: true, recursive: true })
  const result = await run({ cwd: dir, parallelism: false })
  expect(result.failed).toHaveLength(0)
  expect(result.cache?.hits).toBe(result.written.length + result.skipped.length)
  expect((await readUtf8(join(dir, 'docs', 'math.md'))).length).toBeGreaterThan(0)
})

test('cache: false disables the cache entirely (no file is created)', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await run({ cache: false, cwd: dir, parallelism: false })
  expect(result.failed).toHaveLength(0)
  expect(result.cache).toBeUndefined()
  await expect(readUtf8(join(dir, '.mdocscache'))).rejects.toThrow(/ENOENT/)
})

test('a corrupt cache file is ignored: run succeeds, one cache note recorded', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  await writeUtf8(join(dir, '.mdocscache'), '{{{ corrupt')
  const result = await run({ cwd: dir, parallelism: false })
  expect(result.failed).toHaveLength(0)
  expect(result.written.length).toBeGreaterThanOrEqual(2)
  expect(result.issues.some((issue) => /cache/i.test(issue.issue))).toBe(true)
})

test('config file cache: false disables the render cache', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  await writeUtf8(join(dir, 'mdocs.config.js'), 'export default { cache: false }\n')
  const result = await run({ cwd: dir, parallelism: false })
  expect(result.failed).toHaveLength(0)
  expect(result.cache).toBeUndefined()
  await expect(readUtf8(join(dir, '.mdocscache'))).rejects.toThrow(/ENOENT/)
})

test('--dry-run never creates or touches the cache', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  await run({ cwd: dir, dryRun: true })
  await expect(readUtf8(join(dir, '.mdocscache'))).rejects.toThrow(/ENOENT/)
})

test('monorepo: a package without dist loses dist lines, the other keeps them', async () => {
  const dir = await projectCopy('monorepo')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await rm(join(dir, 'packages', 'beta', 'dist'), { force: true, recursive: true })

  const result = await run({ cwd: dir, rootSrcDir: ['packages/*/src'] })
  expect(result.failed).toHaveLength(0)

  const alpha = await readUtf8(join(dir, 'packages', 'alpha', 'docs', 'alpha.md'))
  const beta = await readUtf8(join(dir, 'packages', 'beta', 'docs', 'beta.md'))
  expect(alpha).toMatch(/dist: .*alpha\.js:6/)
  expect(beta).not.toMatch(/^dist: /m)
  expect(result.warnings).toHaveLength(1)
  expect(result.warnings[0]).toMatch(/beta/)
})

test('dry-run plans the writes without writing anything', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await run({ cwd: dir, dryRun: true })
  expect(result.dryRun).toBe(true)
  expect(result.warnings).toEqual([])
  expect(result.written).toHaveLength(3) // plan includes broken.ts
  expect(result.written.every((w) => w.to.endsWith('.md'))).toBe(true)
  await expect(readUtf8(join(dir, 'docs', 'math.md'))).rejects.toThrow(/ENOENT/)
})

test('regular-repo-js: JS projects document JSDoc types without a checker', async () => {
  const dir = await projectCopy('regular-repo-js')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await run({ cwd: dir })
  expect(result.failed).toHaveLength(0)

  const md = await readUtf8(join(dir, 'docs', 'index.md'))
  expect(md).toMatch(/src: .*index\.js:9/)
  expect(md).toMatch(/dist: .*index\.js:8/)
  expect(md).toMatch(/\| list \| <code>Array<\/code>|Array.&lt;number&gt;/)
})

test('regular-repo-ts: a docs/ path that is a file fails the run with per-file errors, not a crash', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  // Turn docs/ into a plain FILE — mkdir of the output path must surface as a per-file failure.
  await writeUtf8(join(dir, 'docs'), 'i am a file, not a dir')

  const result = await run({ cwd: dir })
  expect(result.failed).toHaveLength(2) // math.ts and geometry.ts both fail to write
  expect(result.skipped).toHaveLength(1) // broken.ts stays skipped
  expect(result.failed.every((f) => f.error.length > 0)).toBe(true)
})

test('dry-run reports collection notes (e.g. unreadable directories) without failing', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.js'), 'export default {}')
  await mkdirp(join(dir, 'src', 'locked'))
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp fixture path; tests never escape the temp dir
  await chmod(join(dir, 'src', 'locked'), 0o000)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp fixture path; tests never escape the temp dir
  onTestFinished(() => chmod(join(dir, 'src', 'locked'), 0o700))

  const result = await run({ cwd: dir, dryRun: true })
  expect(result.configPath).toBe(join(dir, 'mdocs.config.js'))
  expect(result.dryRun).toBe(true)
  expect(result.issues).toHaveLength(1)
  expect(result.issues[0]?.issue).toContain('cannot read directory')
})

test('stale dist sourcemap marks every dist line approximate, exactly one note per file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-stale-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'src'))
  await mkdirp(join(dir, 'dist'))

  await writeUtf8(
    join(dir, 'src', 'index.js'),
    '/**\n * Adds two numbers.\n * @param {number} a - first addend\n * @param {number} b - second addend\n * @returns {number} the sum\n */\nexport function add(a = 1, b = 1) {\n  return a + b\n}\n\n/**\n * Multiplies two numbers.\n * @param {number} a - first factor\n * @param {number} b - second factor\n * @returns {number} the product\n */\nexport function mul(a = 1, b = 1) {\n  return a * b\n}\n',
  )
  // dist/ exists but its sourcemap points at an unrelated source — every lookup misses.
  await writeUtf8(join(dir, 'dist', 'index.js'), 'export function add(a, b) { return a + b }\nexport function mul(a, b) { return a * b }\n')
  await writeUtf8(
    join(dir, 'dist', 'index.js.map'),
    JSON.stringify({
      file: 'index.js',
      mappings: 'AAAA',
      names: [],
      sources: ['elsewhere.ts'],
      version: 3,
    }),
  )

  const result = await run({ cwd: dir })
  expect(result.failed).toHaveLength(0)
  expect(result.written).toHaveLength(1)

  const md = await readUtf8(join(dir, 'docs', 'index.md'))
  expect(md).toMatch(/dist: .*dist[\\/]index\.js \(approx\.\)/)
  expect(result.issues.filter((i) => i.issue.includes('dist sourcemap missing or unmatched'))).toHaveLength(1)
})

test('run without explicit cwd uses process.cwd()', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const originalCwd = process.cwd()
  process.chdir(dir)
  onTestFinished(() => process.chdir(originalCwd))

  const result = await run({})
  expect(result.cwd).toBe(dir)
  expect(result.written).toHaveLength(2)
})

test('a configured mdocs.config.js is picked up and reflected in the result', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.js'), 'export default { rootSrcDir: ["src"], outDirName: "custom-docs" }')

  const result = await run({ cwd: dir })
  expect(result.configPath).toBe(join(dir, 'mdocs.config.js'))
  expect(result.written.every((w) => w.to.includes(join('custom-docs')))).toBe(true)
})

test('stale TS dist sourcemap marks every dist line approximate, exactly one note per file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-stale-ts-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'src'))
  await mkdirp(join(dir, 'dist'))

  await writeUtf8(
    join(dir, 'src', 'math.ts'),
    '/**\n * Adds two numbers.\n * @param {number} a - first addend\n * @param {number} b - second addend\n * @returns {number} the sum\n */\nexport function add(a: number, b: number): number {\n  return a + b\n}\n\n/**\n * Multiplies two numbers.\n * @param {number} a - first factor\n * @param {number} b - second factor\n * @returns {number} the product\n */\nexport function mul(a: number, b: number): number {\n  return a * b\n}\n',
  )
  await writeUtf8(join(dir, 'dist', 'math.js'), 'export function add(a, b) { return a + b }\n')
  await writeUtf8(
    join(dir, 'dist', 'math.js.map'),
    JSON.stringify({ file: 'math.js', mappings: 'AAAA', names: [], sources: ['elsewhere.ts'], version: 3 }),
  )

  const result = await run({ cwd: dir })
  expect(result.failed).toHaveLength(0)
  const md = await readUtf8(join(dir, 'docs', 'math.md'))
  expect(md).toMatch(/dist: .*dist[\\/]math\.js:\d+ \(approx\.\)/)
  expect(result.issues.filter((i) => i.issue.includes('dist sourcemap missing or unmatched'))).toHaveLength(1)
})

test('run in non-dry-run mode surfaces collection notes', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.js'), 'export default {}')
  await mkdirp(join(dir, 'src', 'locked'))
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp fixture path; tests never escape the temp dir
  await chmod(join(dir, 'src', 'locked'), 0o000)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp fixture path; tests never escape the temp dir
  onTestFinished(() => chmod(join(dir, 'src', 'locked'), 0o700))

  const result = await run({ cwd: dir })
  expect(result.failed).toHaveLength(0)
  expect(result.issues).toHaveLength(1)
  expect(result.issues[0]?.issue).toContain('cannot read directory')
})

test('jsdoc2md writing warnings still renders and does not leak scratch paths', async () => {
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  // A single default export makes dmd warn ("Module tag required in this file").
  await writeUtf8(join(dir, 'src', 'single.mjs'), '/** Greet someone. */\nexport default function greet(name) { return "hi " + name }\n')

  const result = await run({ cwd: dir })
  // math.ts + geometry.ts succeed as before; single.mjs fails with a clear note.
  expect(result.failed).toHaveLength(1)
  expect(result.failed.some((f) => f.file.endsWith('single.mjs'))).toBe(true)
  const md = await readUtf8(join(dir, 'docs', 'math.md'))
  // The pointer references the fixture's own dist, not mdocs's scratch files.
  expect(md).toMatch(/dist[\\/]math\.js:26/)
})
