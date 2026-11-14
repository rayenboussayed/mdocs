/**
 * Unit tests for src/render.ts's internal branches, driven through
 * `renderSourceFile` with jsdoc-to-markdown mocked out — the error paths that
 * are unreachable in a healthy fixture.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTemplateData: vi.fn(),
  render: vi.fn(),
}))

vi.mock('jsdoc-to-markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jsdoc-to-markdown')>()
  return {
    ...actual,
    default: { ...actual.default, getTemplateData: mocks.getTemplateData, render: mocks.render },
  }
})

import type { SourceFile } from './resolve.js'

import { renderSourceFile } from './render.js'
import { mkdirp, writeUtf8 } from './test-utils.js'

/**
 * Builds a minimal doclet for tests (defaults: function/thing).
 * @param lineno - The jsdoc-reported line number of the doclet.
 * @param kind - The doclet kind.
 * @param name - The doclet name.
 * @returns The doclet object.
 */
function doclet(lineno: number, kind = 'function', name = 'thing') {
  return {
    kind,
    longname: name,
    meta: { filename: 'file.js', lineno, path: '/scratch/0' },
    name,
    params: [{ description: 'x', name: 'input' }],
  }
}

/**
 * Writes `files` (name → content) under `<dir>/src`.
 * @param dir - The fixture root to create.
 * @param files - The files to write.
 * @returns Nothing.
 */
async function setup(dir: string, files: Record<string, string>): Promise<void> {
  await mkdirp(join(dir, 'src'))
  for (const [name, content] of Object.entries(files)) {
    await writeUtf8(join(dir, 'src', name), content)
  }
}

/**
 * Builds a SourceFile record for tests.
 * @param relPath - The posix-relative path of the source.
 * @param extension - The source extension.
 * @param dir - The absolute project directory.
 * @returns The SourceFile record.
 */
function sourceFile(relPath: string, extension: SourceFile['extension'], dir: string): SourceFile {
  return {
    absPath: join(dir, 'src', relPath),
    extension,
    project: { distDir: join(dir, 'dist'), outDir: join(dir, 'docs'), srcDir: join(dir, 'src') },
    relPath,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('jsdoc throwing → fail result with message (and jsdoc called twice — retry once)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.ts': 'export const x = 1\n' })
    mocks.getTemplateData.mockRejectedValueOnce(new Error('jsdoc crashed')).mockRejectedValueOnce(new Error('jsdoc crashed'))
    const result = await renderSourceFile(
      { file: sourceFile('x.ts', '.ts', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.error).toMatch(/jsdoc failed: jsdoc crashed/)
    expect(mocks.getTemplateData).toHaveBeenCalledTimes(2)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('jsdoc failing once then succeeding renders (retry absorbed)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.ts': 'export const x = 1\n' })
    mocks.getTemplateData.mockRejectedValueOnce(new Error('flaky')).mockResolvedValue([doclet(1)])
    mocks.render.mockResolvedValue('rendered docs')
    const result = await renderSourceFile(
      { file: sourceFile('x.ts', '.ts', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.markdown).toBe('rendered docs')
    expect(result.symbols).toBe(1)
    expect(mocks.getTemplateData).toHaveBeenCalledTimes(2)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('render throwing → fail result with message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.ts': 'export const x = 1\n' })
    mocks.getTemplateData.mockResolvedValue([doclet(1)])
    mocks.render.mockRejectedValue(new Error('handlebars boom'))
    const result = await renderSourceFile(
      { file: sourceFile('x.ts', '.ts', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.error).toMatch(/render failed: handlebars boom/)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('jsdoc throwing a non-Error value formats the message safely', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.ts': 'export const x = 1\n' })
    mocks.getTemplateData.mockRejectedValueOnce('jsdoc just died').mockRejectedValueOnce('jsdoc just died')
    const result = await renderSourceFile(
      { file: sourceFile('x.ts', '.ts', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.error).toMatch(/jsdoc failed: jsdoc just died/)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('empty rendered markdown → per-file failure, never a silent 0-byte .md', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'single.mjs': '/** Greets. */\nexport default function greet(name) { return name }\n' })
    mocks.getTemplateData.mockResolvedValue([doclet(1)])
    mocks.render.mockResolvedValue('   \n')
    const result = await renderSourceFile(
      { file: sourceFile('single.mjs', '.mjs', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.error).toMatch(/no renderable docs/)
    expect(result.markdown).toBeUndefined()
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('doclets beyond the emitted lines fall back to jsdoc lines with (approx.)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.ts': 'export const x = 1\n' })
    // Two doclets, both out of range of the transpile output and both missing dist info.
    mocks.getTemplateData.mockResolvedValue([doclet(998), doclet(999)])
    mocks.render.mockResolvedValue('rendered docs')
    const result = await renderSourceFile(
      { file: sourceFile('x.ts', '.ts', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.symbols).toBe(2)
    expect(result.markdown).toBe('rendered docs')
    // Neither pointer can be mapped — the doclets dmd receives must carry (approx.) src and dist.
    const renderArgs = mocks.render.mock.calls[0]?.[0] as {
      data: Array<{ mdocs?: { dist: string; src: string }; meta?: { lineno?: number } }>
    }
    const byLine = new Map(renderArgs.data.map((doclet) => [doclet.meta?.lineno, doclet.mdocs]))
    for (const lineno of [998, 999]) {
      expect(byLine.get(lineno)?.src).toMatch(/\(approx\.\)$/)
      expect(byLine.get(lineno)?.dist).toMatch(/\(approx\.\)$/)
    }
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('two doclets hitting the same "dist sourcemap missing" issue are deduped', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.js': 'export const x = 1\nexport const y = 2\n' })
    await mkdirp(join(dir, 'dist'))
    await writeUtf8(join(dir, 'dist', 'x.js'), 'export const x = 1\n') // present, no .map next to it
    mocks.getTemplateData.mockResolvedValue([doclet(1), doclet(2, 'function', 'y')])
    mocks.render.mockResolvedValue('rendered docs')
    const result = await renderSourceFile(
      { file: sourceFile('x.js', '.js', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.issues.filter((i) => i.includes('dist sourcemap missing'))).toHaveLength(1)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('reading a directory as a source file fails with "cannot read source"', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    const srcDir = join(dir, 'src', 'a-dir')
    await mkdirp(srcDir)
    const result = await renderSourceFile(
      { file: sourceFile('a-dir', '.js', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.error).toMatch(/cannot read source/)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('jsdoc hanging forever hits the timeout error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.ts': 'export const x = 1\n' })
    mocks.getTemplateData.mockReturnValue(new Promise(() => undefined)) // never settles
    const result = await renderSourceFile(
      { file: sourceFile('x.ts', '.ts', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), timeoutMs: 50, typeProgram: null },
    )
    expect(result.error).toMatch(/jsdoc timed out after 50/)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('a scratchDir pointing at a file fails with "cannot create the scratch directory"', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.ts': 'export const x = 1\n' })
    const blocker = join(dir, 'scratch-blocker')
    await writeUtf8(blocker, 'blocked')
    const result = await renderSourceFile(
      { file: sourceFile('x.ts', '.ts', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: blocker, typeProgram: null },
    )
    expect(result.error).toMatch(/cannot create the scratch directory/)
    expect(mocks.getTemplateData).not.toHaveBeenCalled()
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})

test('dmd stderr warnings are swallowed (no scratch-path leaks) and the file still renders', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-render-'))
  try {
    await setup(dir, { 'x.ts': 'export const x = 1\n' })
    mocks.getTemplateData.mockResolvedValue([doclet(1)])
    mocks.render.mockImplementation(() => {
      console.warn('Module tag required in this file: /scratch-abcdef123/0/file.js')
      return 'rendered docs'
    })
    const result = await renderSourceFile(
      { file: sourceFile('x.ts', '.ts', dir), index: 0 },
      { outPath: join(dir, 'out.md'), partials: ['a', 'b'], pointerBase: dir, scratchDir: join(dir, 'scratch'), typeProgram: null },
    )
    expect(result.markdown).toBe('rendered docs')
    expect(result.error).toBeUndefined()
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
})
