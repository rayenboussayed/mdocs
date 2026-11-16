/**
 * Unit tests for src/resolve.ts — root expansion, collection, output paths.
 */
import { chmod, mkdtemp, rm, rm as rmrfs, symlink } from 'node:fs/promises'
import { cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { expect, onTestFinished, test } from 'vitest'

import { resolveConfig } from './config.js'
import { collectSourceFiles, outputPathFor, probeMissingDistDirs, resolveProjects } from './resolve.js'
import { expectMdaicsError, mkdirp, writeUtf8 } from './test-utils.js'

const fixtures = join(process.cwd(), 'test', 'fixtures')

/**
 *
 * @param src - The fixture repo name to copy.
 * @returns The absolute path of the copied project.
 */
async function tmpCopy(src: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-resolve-'))
  await cp(src, join(dir, 'proj'), { recursive: true })
  return join(dir, 'proj')
}

test('probeMissingDistDirs: flags missing dirs, existing dirs and dirs that are files', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const projects = await resolveProjects(resolveConfig({}), dir)
  await rm(join(dir, 'dist'), { force: true, recursive: true })
  expect([...(await probeMissingDistDirs(projects))]).toEqual([join(dir, 'dist')])

  await mkdirp(join(dir, 'dist'))
  expect([...(await probeMissingDistDirs(projects))]).toEqual([])

  await rm(join(dir, 'dist'), { force: true, recursive: true })
  await writeUtf8(join(dir, 'dist'), 'not a directory')
  expect([...(await probeMissingDistDirs(projects))]).toEqual([join(dir, 'dist')])
})

test('resolveProjects: literal src dir resolves to sibling dist/docs', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const projects = await resolveProjects(resolveConfig({}), dir)
  expect(projects).toHaveLength(1)
  expect(projects[0]?.srcDir).toBe(join(dir, 'src'))
  expect(projects[0]?.distDir).toBe(join(dir, 'dist'))
  expect(projects[0]?.outDir).toBe(join(dir, 'docs'))
})

test('resolveProjects: monorepo glob expands to package src dirs', async () => {
  const dir = await tmpCopy(join(fixtures, 'monorepo'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const projects = await resolveProjects(resolveConfig({ rootSrcDir: 'packages/*/src' }), dir)
  expect(projects).toHaveLength(2)
  const srcs = projects.map((p) => p.srcDir).sort()
  expect(srcs).toEqual([join(dir, 'packages', 'alpha', 'src'), join(dir, 'packages', 'beta', 'src')])
  for (const project of projects) {
    expect(project.distDir).toBe(join(project.srcDir, '..', 'dist'))
    expect(project.outDir).toBe(join(project.srcDir, '..', 'docs'))
  }
})

test('resolveProjects: overlapping roots are rejected', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'src', 'widgets'))
  const error = await expectMdaicsError(() => resolveProjects(resolveConfig({ rootSrcDir: ['src', 'src/widgets'] }), dir))
  expect(error.code).toBe('OVERLAPPING_ROOTS')
})

test('resolveProjects: missing roots are rejected with the pattern', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const literal = await expectMdaicsError(() => resolveProjects(resolveConfig({ rootSrcDir: 'no/such/dir' }), dir))
  expect(literal.code).toBe('INVALID_ROOT')
  const globMiss = await expectMdaicsError(() => resolveProjects(resolveConfig({ rootSrcDir: 'packages/*/nope' }), dir))
  expect(globMiss.code).toBe('NO_ROOTS')
})

test('collectSourceFiles: collects sources, skips .d.ts and unsupported files', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const projects = await resolveProjects(resolveConfig({}), dir)
  const { files } = await collectSourceFiles(projects)
  const rels = files.map((f) => f.relPath).sort()
  expect(rels).toEqual(['broken.ts', 'geometry.ts', 'math.ts'])
  expect(files.every((f) => f.absPath.startsWith(dir))).toBeTruthy()
  expect(files.every((f) => !f.absPath.includes('node_modules'))).toBeTruthy()
})

test('outputPathFor: mirrors the src tree with .md extension', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const projects = await resolveProjects(resolveConfig({ outDirName: 'docs/api' }), dir)
  const files = (await collectSourceFiles(projects)).files
  for (const file of files) {
    const out = outputPathFor(file)
    expect(out.startsWith(join(dir, 'docs', 'api') + sep)).toBe(true)
    expect(out.endsWith('.md')).toBeTruthy()
    expect(out.includes(file.relPath.replace(/\.[^.]+$/, ''))).toBeTruthy()
  }
})

test('collectSourceFiles: does not follow directory symlinks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-link-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'src', 'real'))
  await writeUtf8(join(dir, 'src', 'real', 'a.ts'), 'export const a = 1\n')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp fixture path; tests never escape the temp dir
  await symlink(join(dir, 'src'), join(dir, 'src', 'loop'))
  const projects = await resolveProjects(resolveConfig({}), dir)
  const files = (await collectSourceFiles(projects)).files
  expect(files.map((f) => f.relPath).sort()).toEqual(['real/a.ts'])
})

test('resolveProjects: output stays contained for nested outDirName', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const projects = await resolveProjects(resolveConfig({ outDirName: 'docs/api/v1' }), dir)
  expect(projects[0]?.outDir).toBe(join(dir, 'docs', 'api', 'v1'))
})

test('collectSourceFiles: an unreadable subdirectory is skipped with a note', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-locked-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'src', 'ok'))
  await mkdirp(join(dir, 'src', 'locked'))
  await writeUtf8(join(dir, 'src', 'ok', 'a.ts'), 'export const a = 1\n')
  await writeUtf8(join(dir, 'src', 'locked', 'b.ts'), 'export const b = 1\n')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp fixture path; tests never escape the temp dir
  await chmod(join(dir, 'src', 'locked'), 0o000)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp fixture path; tests never escape the temp dir
  onTestFinished(() => chmod(join(dir, 'src', 'locked'), 0o700).then(() => rmrfs(dir, { force: true, recursive: true })))
  const projects = await resolveProjects(resolveConfig({}), dir)
  const { files, issues } = await collectSourceFiles(projects)
  expect(files.map((f) => f.relPath)).toEqual(['ok/a.ts'])
  expect(issues).toHaveLength(1)
  expect(issues[0]).toContain('cannot read directory')
})

test('collectSourceFiles: duplicate stem files fail with OUTPUT_COLLISION', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-dup-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'src'))
  await writeUtf8(join(dir, 'src', 'dup.ts'), 'export const a = 1\n')
  await writeUtf8(join(dir, 'src', 'dup.mjs'), 'export const b = 1\n')
  const projects = await resolveProjects(resolveConfig({}), dir)
  await expect(collectSourceFiles(projects)).rejects.toThrow(/OUTPUT_COLLISION|produce .*dup\.md/i)
})

test('resolveProjects: glob that matches only files errors with a distinct message', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const projects = resolveProjects(resolveConfig({ rootSrcDir: 'src/*.ts' }), dir)
  await expect(projects).rejects.toThrow(/files but no directories/)
})

test('resolveProjects: entries under node_modules are ignored by glob expansion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-nm-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'node_modules', 'pkg'))
  await mkdirp(join(dir, 'src'))
  const projects = await resolveProjects(resolveConfig({ rootSrcDir: ['*'] }), dir)
  const srcs = projects.map((p) => p.srcDir)
  expect(srcs.some((s) => s.includes('node_modules'))).toBe(false)
  expect(srcs).toContain(join(dir, 'src'))
})

test('resolveProjects: a src root pointing at a file is rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-file-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await writeUtf8(join(dir, 'srcfile'), 'not a dir')
  await expect(resolveProjects(resolveConfig({ rootSrcDir: 'srcfile' }), dir)).rejects.toThrow(/not a directory/)
})

test('resolveProjects: realpath dedups symlinked and dotted roots', async () => {
  const dir = await tmpCopy(join(fixtures, 'regular-repo-ts'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const projects = await resolveProjects(resolveConfig({ rootSrcDir: ['./src', 'src/'] }), dir)
  expect(projects).toHaveLength(1)
})

test('collectSourceFiles: hidden dotfiles and extension-less files are skipped', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-dot-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'src'))
  await writeUtf8(join(dir, 'src', '.hidden.ts'), 'export const a = 1\n')
  await writeUtf8(join(dir, 'src', 'noext'), 'export const b = 1\n')
  await writeUtf8(join(dir, 'src', 'real.ts'), 'export const c = 1\n')
  const projects = await resolveProjects(resolveConfig({}), dir)
  const { files } = await collectSourceFiles(projects)
  expect(files.map((f) => f.relPath)).toEqual(['real.ts'])
})

test('collectSourceFiles: .d.ts files are excluded, .TS is accepted case-insensitively', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-dts-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'src'))
  await writeUtf8(join(dir, 'src', 'types.d.ts'), 'export interface X { a: number }\n')
  await writeUtf8(join(dir, 'src', 'SHOUT.TS'), 'export const x = 1\n')
  await writeUtf8(join(dir, 'src', 'keep.ts'), 'export const y = 1\n')
  const projects = await resolveProjects(resolveConfig({}), dir)
  const { files } = await collectSourceFiles(projects)
  expect(files.map((f) => f.relPath).sort()).toEqual(['SHOUT.TS', 'keep.ts'])
})

test('resolveProjects: a dangling symlink match is skipped but still counts as matched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-dangling-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await mkdirp(join(dir, 'packages', 'real'))
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp fixture path; tests never escape the temp dir
  await symlink(join(dir, 'nowhere'), join(dir, 'packages', 'dangling'))
  const projects = await resolveProjects(resolveConfig({ rootSrcDir: ['packages/*'] }), dir)
  expect(projects.map((project) => project.srcDir)).toEqual([join(dir, 'packages', 'real')])
})
