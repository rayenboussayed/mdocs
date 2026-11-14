/**
 * Unit tests for src/config.ts — validation, defaults, loading semantics.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, onTestFinished, test } from 'vitest'

import { DEFAULT_CONFIG, defineConfig, loadConfig, resolveConfig } from './config.js'
import { expectMdocsError, mkdirp, writeUtf8 } from './test-utils.js'

test('defineConfig returns the typed config (identity)', () => {
  const cfg = { rootSrcDir: 'lib' }
  expect(defineConfig(cfg)).toBe(cfg)
})

test('resolveConfig applies defaults for an empty object', () => {
  const resolved = resolveConfig({})
  expect(resolved.rootSrcDir).toEqual(['src'])
  expect(resolved.rootDistDir).toBe('dist')
  expect(resolved.outDirName).toBe('docs')
  expect(Number.isInteger(resolved.parallelism)).toBe(true)
  expect(resolved.parallelism).toBeGreaterThanOrEqual(1)
})

test('resolveConfig honours explicit values', () => {
  const resolved = resolveConfig({ outDirName: 'md', parallelism: false, rootDistDir: 'build', rootSrcDir: ['a', 'b'] })
  expect(resolved.rootSrcDir).toEqual(['a', 'b'])
  expect(resolved.rootDistDir).toBe('build')
  expect(resolved.outDirName).toBe('md')
  expect(resolved.parallelism).toBe(1)
})

test('resolveConfig allows nested relative dir names', () => {
  const resolved = resolveConfig({ outDirName: 'docs/api', rootDistDir: 'build/out' })
  expect(resolved.outDirName).toBe('docs/api')
  expect(resolved.rootDistDir).toBe('build/out')
})

test('resolveConfig rejects non-object configs', async () => {
  for (const bad of [null, 42, 'src', [], true]) {
    const error = await expectMdocsError(() => resolveConfig(bad))
    expect(error.code).toBe('INVALID_CONFIG')
  }
})

test('resolveConfig rejects unknown keys with the allowed list', async () => {
  const error = await expectMdocsError(() => resolveConfig({ rootSrc: 'src' }))
  expect(error.message).toMatch(/unknown config key/)
  expect(error.message).toMatch(/rootSrcDir/)
})

test('resolveConfig rejects bad rootSrcDir shapes', async () => {
  expect(() => resolveConfig({ rootSrcDir: 42 })).toThrow(/rootSrcDir/)
  const arrayError = await expectMdocsError(() => resolveConfig({ rootSrcDir: [42] }))
  expect(arrayError.message).toMatch(/rootSrcDir/)
  expect(() => resolveConfig({ rootSrcDir: [] })).toThrow(/at least one/)
  const mixedError = await expectMdocsError(() => resolveConfig({ rootSrcDir: ['src', 7] }))
  expect(mixedError.message).toMatch(/rootSrcDir/)
  expect(() => resolveConfig({ rootSrcDir: '   ' })).toThrow(/rootSrcDir/)
})

test('resolveConfig rejects escaping/absolute outDirName and rootDistDir', async () => {
  for (const bad of ['../escape', '/abs', 'a/../../b', '.', './', '', 'a/b/../../../c']) {
    expect((await expectMdocsError(() => resolveConfig({ outDirName: bad }))).code).toBe('INVALID_CONFIG')
    expect((await expectMdocsError(() => resolveConfig({ rootDistDir: bad }))).code).toBe('INVALID_CONFIG')
  }
})

test('resolveConfig rejects forbidden path segment characters', () => {
  expect(() => resolveConfig({ outDirName: 'docs<>' })).toThrow(/invalid path segment/i)
  expect(() => resolveConfig({ outDirName: 'a:b' })).toThrow(/invalid path segment/i)
})

test('parallelism: true → os parallelism, false → 1, N → N', () => {
  expect(Number.isInteger(resolveConfig({ parallelism: true }).parallelism)).toBe(true)
  expect(resolveConfig({ parallelism: false }).parallelism).toBe(1)
  expect(resolveConfig({ parallelism: 4 }).parallelism).toBe(4)
})

test('parallelism rejects 0, negatives, floats, NaN and strings', () => {
  for (const bad of [0, -1, 2.5, Number.NaN, '4', Infinity]) {
    expect(() => resolveConfig({ parallelism: bad as never })).toThrow(/parallelism/)
  }
})

test('loadConfig falls back to defaults when no config exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const { config, filePath } = await loadConfig(dir)
  expect(filePath).toBeUndefined()
  expect(config.rootSrcDir).toEqual([...DEFAULT_CONFIG.rootSrcDir])
})

test('loadConfig fails closed for an explicit missing config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const error = await expectMdocsError(() => loadConfig(dir, join(dir, 'nope.config.js')))
  expect(error.code).toBe('CONFIG_NOT_FOUND')
})

interface LoadCase {
  contents: string
  extraFiles?: Record<string, string>
  file: string
  verify: (config: import('./config.js').ResolvedMdocsConfig) => void
}

const loadCases: LoadCase[] = [
  {
    contents: 'module.exports = { rootSrcDir: ["lib"], outDirName: "md" }',
    file: 'mdocs.config.cjs',
    verify: (config) => {
      expect(config.rootSrcDir).toEqual(['lib'])
      expect(config.outDirName).toBe('md')
    },
  },
  {
    contents: 'export default { rootSrcDir: "gen", parallelism: 2 }',
    file: 'mdocs.config.mjs',
    verify: (config) => {
      expect(config.rootSrcDir).toEqual(['gen'])
      expect(config.parallelism).toBe(2)
    },
  },
  {
    contents: 'export default { rootSrcDir: "esm-in-cjs" }',
    extraFiles: { 'package.json': '{"type":"commonjs"}' },
    file: 'mdocs.config.js',
    verify: (config) => {
      expect(config.rootSrcDir).toEqual(['esm-in-cjs'])
    },
  },
  {
    contents: 'export default (env) => ({ rootSrcDir: ["fn-" + env.command] })',
    file: 'mdocs.config.mjs',
    verify: (config) => {
      expect(config.rootSrcDir).toEqual(['fn-build'])
    },
  },
]

test.each(loadCases)('loadConfig loads $file', async ({ contents, extraFiles, file, verify }) => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  for (const [name, body] of Object.entries(extraFiles ?? {})) {
    await writeUtf8(join(dir, name), body)
  }
  await writeUtf8(join(dir, file), contents)
  const { config, filePath } = await loadConfig(dir)
  expect(filePath).toBe(join(dir, file))
  verify(config)
})

test.each([
  { contents: 'export default 42', message: 'received number', name: 'a number' },
  { contents: 'export default null', message: 'received null', name: 'null' },
  { contents: 'export default [1, 2]', message: 'received an array', name: 'an array' },
])('loadConfig rejects a config exporting $name', async ({ contents, message }) => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.mjs'), contents)
  const error = await expectMdocsError(() => loadConfig(dir))
  expect(error.code).toBe('INVALID_CONFIG')
  expect(error.message).toContain(message)
})

test('loadConfig merges programmatic overrides over the file config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.mjs'), 'export default { rootSrcDir: "from-file", outDirName: "md" }')
  const { config } = await loadConfig(dir, undefined, { rootSrcDir: 'override' })
  expect(config.rootSrcDir).toEqual(['override'])
  expect(config.outDirName).toBe('md')
})

test('a directory full of nothing yields CONFIG_NOT_FOUND-independent defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'sub'))
  const { filePath } = await loadConfig(join(dir, 'sub'))
  expect(filePath).toBeUndefined()
})

test('loadConfig: an unreadable explicit --config path fails closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const error = await expectMdocsError(() => loadConfig(dir, join(dir, 'nope.config.js')))
  expect(error.code).toBe('CONFIG_NOT_FOUND')
})

test.each([
  { contents: 'export default { rootSrcDir: ["typed-esm"] }', expected: ['typed-esm'], name: 'a .js config in a "type":"module" package is imported as ESM', packageType: 'module' },
  { contents: 'export default { rootSrcDir: ["fallback-esm"] }', expected: ['fallback-esm'], name: 'ESM syntax in a .js config falls back to a sibling .mjs copy', packageType: 'commonjs' },
  { contents: 'const cfg = await Promise.resolve({ rootSrcDir: ["tla"] })\nexport default cfg', expected: ['tla'], name: 'a top-level-await .js config loads through the ESM fallback', packageType: 'commonjs' },
])('loadConfig: $name', async ({ contents, expected, packageType }) => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'package.json'), JSON.stringify({ type: packageType }))
  await writeUtf8(join(dir, 'mdocs.config.js'), contents)
  const { config, filePath } = await loadConfig(dir)
  expect(config.rootSrcDir).toEqual(expected)
  expect(filePath).toBe(join(dir, 'mdocs.config.js'))
})

test('loadConfig: a .js config with a plain syntax error fails with CONFIG_LOAD_FAILED', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'package.json'), '{"type":"commonjs"}')
  await writeUtf8(join(dir, 'mdocs.config.js'), 'module.exports = {\n')
  const error = await expectMdocsError(() => loadConfig(dir))
  expect(error.code).toBe('CONFIG_LOAD_FAILED')
})

test('loadConfig: a .cjs config with ESM syntax does NOT fall back — it fails with CONFIG_LOAD_FAILED', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.cjs'), 'export default {}')
  const error = await expectMdocsError(() => loadConfig(dir))
  expect(error.code).toBe('CONFIG_LOAD_FAILED')
})

test.each([
  { contents: 'export default Promise.resolve({ rootSrcDir: ["promised"] })', expected: ['promised'], name: 'a promise-export is resolved before validation' },
  { contents: 'export const rootSrcDir = "named"', expected: ['named'], name: 'named exports are picked up as config keys' },
])('loadConfig: $name', async ({ contents, expected }) => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.mjs'), contents)
  const { config } = await loadConfig(dir)
  expect(config.rootSrcDir).toEqual(expected)
})

test('loadConfig: nearest package.json determines the loader for .js configs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'sub', 'nested'))
  await writeUtf8(join(dir, 'package.json'), '{"type":"module"}')
  await writeUtf8(join(dir, 'sub', 'nested', 'mdocs.config.js'), 'export default { rootSrcDir: ["nested-module"] }')
  const { config } = await loadConfig(join(dir, 'sub', 'nested'))
  expect(config.rootSrcDir).toEqual(['nested-module'])
})

test('loadConfig: an invalid nearest package.json fails .js configs with CONFIG_LOAD_FAILED', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  // Node resolves the nearest package.json eagerly — a broken one fails the
  // require before mdocs ever sees the config; the failure must be wrapped, not raw.
  await writeUtf8(join(dir, 'package.json'), '{')
  await writeUtf8(join(dir, 'mdocs.config.js'), 'export default { rootSrcDir: ["broken-pkg-json"] }')
  const error = await expectMdocsError(() => loadConfig(dir))
  expect(error.code).toBe('CONFIG_LOAD_FAILED')
})

test('loadConfig: a .mjs config is loaded even when the nearest package.json is invalid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'package.json'), '{')
  await writeUtf8(join(dir, 'mdocs.config.mjs'), 'export default { rootSrcDir: ["mjs-no-pkg-json"] }')
  const { config } = await loadConfig(dir)
  expect(config.rootSrcDir).toEqual(['mjs-no-pkg-json'])
})

test('loadConfig: unsupported extensions are rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.yaml'), 'rootSrcDir: src')
  await expect(loadConfig(dir, join(dir, 'mdocs.config.yaml'))).rejects.toThrow(/unsupported config extension/)
})

test('resolveConfig: empty rootSrcDir array is rejected', async () => {
  const error = await expectMdocsError(() => resolveConfig({ rootSrcDir: [] }))
  expect(error.message).toMatch(/at least one/)
})

test('parseProcessEnv: valid NODE_ENV is kept, invalid is dropped', async () => {
  const { parseProcessEnv } = await import('./schema.js')
  expect(parseProcessEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv).nodeEnv).toBe('production')
  expect(parseProcessEnv({ NODE_ENV: 'banana' } as NodeJS.ProcessEnv).nodeEnv).toBeUndefined()
})

test('parseProcessEnv: boolean-like flags are decoded case-insensitively', async () => {
  const { parseProcessEnv } = await import('./schema.js')
  expect(parseProcessEnv({ MDOCS_DEBUG: '1' } as NodeJS.ProcessEnv).debug).toBe(true)
  expect(parseProcessEnv({ MDOCS_DEBUG: 'TRUE' } as NodeJS.ProcessEnv).debug).toBe(true)
  expect(parseProcessEnv({ MDOCS_DEBUG: 'yes' } as NodeJS.ProcessEnv).debug).toBe(true)
  expect(parseProcessEnv({ MDOCS_DEBUG: '0' } as NodeJS.ProcessEnv).debug).toBe(false)
  expect(parseProcessEnv({ NO_COLOR: 'on' } as NodeJS.ProcessEnv).noColor).toBe(true)
  expect(parseProcessEnv({} as NodeJS.ProcessEnv).noColor).toBe(false)
})

test('loadConfig: a config whose top-level await rejects fails with CONFIG_LOAD_FAILED (with hint)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'package.json'), '{"type":"commonjs"}')
  await writeUtf8(join(dir, 'mdocs.config.js'), 'await Promise.reject(new Error("tla boom"))\nexport default { rootSrcDir: ["x"] }')
  const error = await expectMdocsError(() => loadConfig(dir))
  expect(error.code).toBe('CONFIG_LOAD_FAILED')
  expect(error.message).toMatch(/rename the file to mdocs\.config\.mjs/)
})

test('loadConfig: a config rejecting with a string surfaces the message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'package.json'), '{"type":"commonjs"}')
  await writeUtf8(join(dir, 'mdocs.config.js'), 'await Promise.reject("string boom")\nexport default {}')
  const error = await expectMdocsError(() => loadConfig(dir))
  expect(error.code).toBe('CONFIG_LOAD_FAILED')
  expect(error.message).toContain('string boom')
})

test('loadConfig: a package.json with a foreign "type" falls back to the ESM sibling path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'package.json'), '{"type":"widget"}')
  await writeUtf8(join(dir, 'mdocs.config.js'), 'export default { rootSrcDir: ["foreign-type"] }')
  const { config } = await loadConfig(dir)
  expect(config.rootSrcDir).toEqual(['foreign-type'])
})

test('parseMdocsConfig: non-object input produces a root-level message without a key prefix', async () => {
  const { parseMdocsConfig } = await import('./schema.js')
  const error = await expectMdocsError(() => parseMdocsConfig('junk' as never))
  expect(error.code).toBe('INVALID_CONFIG')
  expect(error.message).not.toMatch(/^: /)
})

test('loadConfig: a .cjs config exporting a promise resolves to a plain object', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.cjs'), 'module.exports = Promise.resolve({ rootSrcDir: ["cjs-promised"] })')
  const { config } = await loadConfig(dir)
  expect(config.rootSrcDir).toEqual(['cjs-promised'])
})

test('overrides with undefined values fall back to the file config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const { loadConfig } = await import('./config.js')
  await writeUtf8(join(dir, 'mdocs.config.mjs'), 'export default { rootSrcDir: ["from-file"] }')
  const { config } = await loadConfig(dir, undefined, { rootSrcDir: undefined } as never)
  expect(config.rootSrcDir).toEqual(['from-file'])
})

test('loadConfig: function-form config without a valid NODE_ENV falls back to production mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const original = process.env['NODE_ENV']
  process.env['NODE_ENV'] = 'banana'
  onTestFinished(() => {
    if (original === undefined) delete process.env['NODE_ENV']
    else process.env['NODE_ENV'] = original
  })
  await writeUtf8(join(dir, 'mdocs.config.mjs'), 'export default (env) => ({ rootSrcDir: ["mode-" + env.mode] })')
  const { config } = await loadConfig(dir)
  expect(config.rootSrcDir).toEqual(['mode-production'])
})

test.each([
  { contents: 'await Promise.reject(new Error("mjs boom"))\nexport default {}', message: 'mjs boom', name: 'a .mjs config whose top-level await rejects' },
  { contents: 'export default () => { throw new Error("fn boom") }', message: 'fn boom', name: 'a function-form config that throws' },
  { contents: 'export default Promise.reject(new Error("promise boom"))', message: 'promise boom', name: 'a promise-export that rejects' },
])('loadConfig: $name fails with CONFIG_LOAD_FAILED', async ({ contents, message }) => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cfg-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'mdocs.config.mjs'), contents)
  const error = await expectMdocsError(() => loadConfig(dir))
  expect(error.code).toBe('CONFIG_LOAD_FAILED')
  expect(error.message).toContain(message)
})
