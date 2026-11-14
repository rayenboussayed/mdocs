/**
 * End-to-end tests for the `mdocs` CLI binary (compiled `dist/cli.js`),
 * spawned as a child process against copies of the fixtures. jsdoc-api's
 * import creates `~/.jsdoc-api`, so `HOME` is redirected per test.
 */
import { execFile } from 'node:child_process'
import { access, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, onTestFinished, test } from 'vitest'

import { readUtf8 } from '../../src/test-utils.js'

const execFileAsync = promisify(execFile)
const fixtures = join(process.cwd(), 'test', 'fixtures')
const cli = join(process.cwd(), 'dist', 'cli.js')

interface CliResult {
  code: number
  stderr: string
  stdout: string
}

/**
 * Creates a temporary home directory (the e2e tests redirect HOME to it).
 * @returns The absolute path of the directory.
 */
async function homeCopy(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mdocs-home-'))
}

/**
 * Copies a committed fixture into a temporary directory.
 * @param fixture - The fixture name to copy (e.g. `regular-repo-ts`).
 * @returns The absolute path of the copied project.
 */
async function projectCopy(fixture: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-cli-'))
  const dest = join(dir, 'proj')
  await cp(join(fixtures, fixture), dest, { recursive: true })
  return dest
}

/**
 * Runs the compiled CLI in `cwd` with `HOME` redirected to `home`.
 * @param cwd - The working directory for the CLI.
 * @param home - The redirected HOME (isolates `~/.jsdoc-api`).
 * @param args - The CLI arguments to pass.
 * @param env - Extra environment variables to merge in.
 * @returns The exit code, stdout and stderr.
 */
async function spawn(cwd: string, home: string, args: string[], env?: NodeJS.ProcessEnv): Promise<CliResult> {
  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, ...env, FORCE_COLOR: '0', HOME: home, NO_COLOR: '1' },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 60_000,
    })
    return { code: 0, stderr, stdout }
  } catch (error) {
    const err = error as { code?: number; stderr?: string; stdout?: string; }
    return { code: err.code ?? 1, stderr: err.stderr ?? '', stdout: err.stdout ?? '' }
  }
}

test('cli: --help exits 0 and prints usage', async () => {
  const home = await homeCopy()
  onTestFinished(() => rm(home, { force: true, recursive: true }))
  const result = await spawn(process.cwd(), home, ['--help'])
  expect(result.code).toBe(0)
  expect(result.stdout).toMatch(/mdocs \[options\] \[rootSrcDir\.\.\.\]/)
})

test('cli: --version exits 0 and prints a semver', async () => {
  const home = await homeCopy()
  onTestFinished(() => rm(home, { force: true, recursive: true }))
  const result = await spawn(process.cwd(), home, ['--version'])
  expect(result.code).toBe(0)
  expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
})

test('cli: full run on the regular-repo-ts fixture exits 0 and writes docs', async () => {
  const home = await homeCopy()
  onTestFinished(() => rm(home, { force: true, recursive: true }))
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await spawn(dir, home, [])
  expect(result.code).toBe(0)
  expect(result.stdout).toMatch(/2 doc\(s\) written/)
  const md = await readUtf8(join(dir, 'docs', 'math.md'))
  expect(md).toMatch(/src: .*math\.ts:8/)
  expect(md).toMatch(/dist: .*math\.js:7/)
})

test('cli: unknown option exits non-zero with a usage error', async () => {
  const home = await homeCopy()
  onTestFinished(() => rm(home, { force: true, recursive: true }))
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await spawn(dir, home, ['--bogus'])
  expect(result.code).not.toBe(0)
})

test('cli: explicit --config with a missing file exits 1 with a clear error', async () => {
  const home = await homeCopy()
  onTestFinished(() => rm(home, { force: true, recursive: true }))
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await spawn(dir, home, ['--config', join(dir, 'missing.config.js')])
  expect(result.code).toBe(1)
  expect(result.stderr).toMatch(/config file not found/i)
})

test('cli: dry-run prints the plan and writes nothing', async () => {
  const home = await homeCopy()
  onTestFinished(() => rm(home, { force: true, recursive: true }))
  const dir = await projectCopy('regular-repo-ts')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await spawn(dir, home, ['--dry-run'])
  expect(result.code).toBe(0)
  expect(result.stdout).toMatch(/dry-run/)
  await expect(access(join(dir, 'docs', 'math.md'))).rejects.toThrow(/ENOENT/)
})

test('cli: overlapping roots exit 1 with both paths in stderr', async () => {
  const home = await homeCopy()
  onTestFinished(() => rm(home, { force: true, recursive: true }))
  const dir = await projectCopy('monorepo')
  onTestFinished(() => rm(dir, { force: true, recursive: true }))

  const result = await spawn(dir, home, ['packages', 'packages/alpha/src'])
  expect(result.code).toBe(1)
  expect(result.stderr).toMatch(/overlap/i)
})

test('dist/cli.js gets its shebang from the build — the npm bin requires it to execute', async () => {
  const dist = await readUtf8(join(process.cwd(), 'dist', 'cli.js'))
  expect(dist.startsWith('#!/usr/bin/env node')).toBe(true)
})
