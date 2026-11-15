/**
 * Unit tests for src/doclet.ts — doclet normalization and type injection.
 */
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, onTestFinished, test } from 'vitest'

import { type DmdDoclet, injectCheckerTypes, injectPointers, normalizeDoclets } from './doclet.js'
import { writeUtf8 } from './test-utils.js'
import { createTypeProgram } from './tscheck.js'

const fixtures = join(process.cwd(), 'test', 'fixtures')

test('normalizeDoclets: top-level self-parenting class doclets become orphans', () => {
  const data = normalizeDoclets([
    { id: 'Point', kind: 'class', longname: 'Point', memberof: 'Point', name: 'Point' },
    { id: 'Point()', kind: 'constructor', longname: 'Point', memberof: 'Point', name: 'exports.Point' },
    { id: 'Point#distanceTo', kind: 'function', longname: 'Point#distanceTo', memberof: 'Point', name: 'distanceTo' },
  ])
  expect(data[0]?.memberof, 'class doclet loses its self-reference').toBeUndefined()
  expect(data[1]?.memberof, 'constructor doclet keeps its parent').toBe('Point')
  expect(data[1]?.name, 'exports. prefix is stripped').toBe('Point')
  expect(data[2]?.memberof, 'children keep memberof').toBe('Point')
})

test('normalizeDoclets: leaves data without self-references untouched', () => {
  const data = normalizeDoclets([
    { id: 'add', kind: 'function', longname: 'add', name: 'add', scope: 'global' },
  ])
  expect(data[0]?.memberof).toBeUndefined()
})

test('injectPointers: a dist-less pointer attaches src only (no dist key)', () => {
  const data: DmdDoclet[] = [
    { kind: 'function', meta: { filename: 'file.js', lineno: 10, path: '/scratch/0' }, name: 'add' },
  ]
  const pointers = new Map([[10, { src: '/abs/src/math.ts:9' }]])
  injectPointers(data, pointers)
  expect(data[0]?.mdocs).toEqual({ src: '/abs/src/math.ts:9' })
})

test('injectPointers: mdocs fields are attached by generated line', () => {
  const data: DmdDoclet[] = [
    { kind: 'function', meta: { filename: 'file.js', lineno: 10, path: '/scratch/0' }, name: 'add' },
    { kind: 'constructor', memberof: 'Point', name: 'Point' }, // no meta — untouched
  ]
  const pointers = new Map([[10, { dist: '/abs/dist/math.js:8', src: '/abs/src/math.ts:9' }]])
  injectPointers(data, pointers)
  expect(data[0]?.mdocs).toEqual({ dist: '/abs/dist/math.js:8', src: '/abs/src/math.ts:9' })
  expect(data[1]?.mdocs).toBeUndefined()
})

test('injectCheckerTypes: .ts doclets get checker parameter and return types', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await cp(join(fixtures, 'regular-repo-ts'), join(dir, 'proj'), { recursive: true })
  const src = join(dir, 'proj', 'src', 'math.ts')
  const program = createTypeProgram([src])
  expect(program !== null).toBeTruthy()

  const data: DmdDoclet[] = [
    {
      kind: 'function',
      longname: 'add',
      meta: { filename: 'file.js', lineno: 8, path: '/scratch/0' },
      name: 'add',
      params: [{ name: 'a' }, { name: 'b' }],
      returns: [{ description: 'the sum' }],
    },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toEqual({ names: ['number'] })
  expect(data[0]?.params?.[1]?.type).toEqual({ names: ['number'] })
  expect(data[0]?.returns?.[0]?.type).toEqual({ names: ['number'] })
})

test('injectCheckerTypes: class constructor doclets get constructor parameter types', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await cp(join(fixtures, 'regular-repo-ts'), join(dir, 'proj'), { recursive: true })
  const src = join(dir, 'proj', 'src', 'geometry.ts')
  const program = createTypeProgram([src])
  expect(program !== null).toBeTruthy()

  const data: DmdDoclet[] = [
    {
      id: 'Point()',
      kind: 'constructor',
      longname: 'Point',
      memberof: 'Point',
      name: 'Point',
      params: [{ name: 'x' }, { name: 'y' }],
    },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toEqual({ names: ['number'] })
  expect(data[0]?.params?.[1]?.type).toEqual({ names: ['number'] })
})

test('injectCheckerTypes: missing or ambiguous symbols are left untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await cp(join(fixtures, 'regular-repo-ts'), join(dir, 'proj'), { recursive: true })
  const src = join(dir, 'proj', 'src', 'math.ts')
  const program = createTypeProgram([src])
  expect(program !== null).toBeTruthy()

  const data: DmdDoclet[] = [
    { kind: 'function', meta: { filename: 'file.js', lineno: 1, path: '/s/0' }, name: 'doesNotExist', params: [{ name: 'a' }] },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toBeUndefined()
})

test('injectCheckerTypes: program null is a no-op', () => {
  const data: DmdDoclet[] = [
    { kind: 'function', meta: { filename: 'f.js', lineno: 1, path: '/s/0' }, name: 'add', params: [{ name: 'a' }] },
  ]
  injectCheckerTypes(data, null, '/anywhere.ts')
  expect(data[0]?.params?.[0]?.type).toBeUndefined()
})

test('injectCheckerTypes: constructor doclets without memberof fall back to plain name', () => {
  const data: DmdDoclet[] = [
    { kind: 'constructor', name: 'Point', params: [{ name: 'x' }, { name: 'y' }] },
  ]
  // Resolver must not crash on the missing memberof; the checker may miss, that is fine.
  expect(() => injectCheckerTypes(data, null, '/somewhere.ts')).not.toThrow()
})

test('injectCheckerTypes: nameless doclets are skipped without crashing', () => {
  const dir = join(fixtures, 'regular-repo-ts', 'src', 'math.ts')
  const program = createTypeProgram([dir])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'function', params: [{ name: 'a' }] },
    { kind: 'constructor', longname: 'Mystery', params: [{ name: 'a' }] },
  ]
  expect(() => injectCheckerTypes(data, program, dir)).not.toThrow()
})

test('injectCheckerTypes: doclet param without a name is skipped; checker any keeps the JSDoc type', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  await cp(join(fixtures, 'regular-repo-ts'), join(dir, 'proj'), { recursive: true })
  const src = join(dir, 'proj', 'src', 'math.ts')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()

  const data: DmdDoclet[] = [
    {
      kind: 'function',
      longname: 'add',
      name: 'add',
      params: [{ description: 'no name' }, { name: 'b', type: { names: ['string'] } }],
      returns: [{ description: 'keep me', type: { names: ['any'] } }],
    },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toBeUndefined() // no name → no injection
  // checker deduces number for b; JSDoc said string — TS wins (signature is truth)
  expect(data[0]?.params?.[1]?.type).toEqual({ names: ['number'] })
})

test('injectCheckerTypes: checker any keeps the JSDoc type for parameters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'keep.ts')
  // Untyped TS parameter — checker resolves the implicit any; the JSDoc {string} must win.
  await writeUtf8(src, 'export function wrap(item) {\n  return item\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'function', name: 'wrap', params: [{ name: 'item', type: { names: ['string'] } }] },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toEqual({ names: ['string'] }) // checker any → JSDoc wins
})

test('injectCheckerTypes: return type from the checker wins when not any', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'ret.ts')
  await cp(join(fixtures, 'regular-repo-ts', 'src', 'math.ts'), src)
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'function', longname: 'first', name: 'first', params: [{ name: 'items' }] },
  ]
  injectCheckerTypes(data, program, src)
  const ret = data[0]?.returns?.[0]?.type?.names?.[0] ?? ''
  expect(ret).toContain('T')
})

test('injectCheckerTypes: memberof "module:" normalizes to null and falls back to name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'mod.ts')
  await cp(join(fixtures, 'regular-repo-ts', 'src', 'geometry.ts'), src)
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'constructor', memberof: 'module:', name: 'Point', params: [{ name: 'x' }, { name: 'y' }] },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toEqual({ names: ['number'] })
})

test('injectCheckerTypes: kind class is treated as the constructor signature source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'cls.ts')
  await cp(join(fixtures, 'regular-repo-ts', 'src', 'geometry.ts'), src)
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'class', longname: 'Point', name: 'Point', params: [{ name: 'x' }, { name: 'y' }] },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toEqual({ names: ['number'] })
})

test('injectCheckerTypes: missing returns doclet gains a returns entry when the checker has a type', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'retg.ts')
  await cp(join(fixtures, 'regular-repo-ts', 'src', 'math.ts'), src)
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'function', longname: 'clamp', name: 'clamp', params: [{ name: 'value' }, { name: 'min' }, { name: 'max' }] },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.returns?.[0]?.type).toEqual({ names: ['number'] })
})

test('injectCheckerTypes: class doclets without returns are not given one (skip cxor invariant)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'clsignore.ts')
  await cp(join(fixtures, 'regular-repo-ts', 'src', 'geometry.ts'), src)
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'class', longname: 'Point', name: 'Point', params: [{ name: 'x' }, { name: 'y' }] },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.returns).toBeUndefined()
})

test('injectCheckerTypes: memberof dot-selector picks class members for class-level doclets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'meth.ts')
  await cp(join(fixtures, 'regular-repo-ts', 'src', 'geometry.ts'), src)
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'function', longname: 'Point#distanceTo', memberof: 'Point', name: 'distanceTo', params: [{ name: 'other' }] },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toEqual({ names: ['Point'] })
})

test('injectCheckerTypes: memberof "." is treated as no class (injected nothing)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdocs-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'dot.ts')
  await cp(join(fixtures, 'regular-repo-ts', 'src', 'geometry.ts'), src)
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const data: DmdDoclet[] = [
    { kind: 'constructor', memberof: '.', name: 'Point', params: [{ name: 'x' }] },
    { kind: 'constructor', memberof: 'module:f.Point', name: 'Point', params: [{ name: 'x' }, { name: 'y' }] },
  ]
  injectCheckerTypes(data, program, src)
  expect(data[0]?.params?.[0]?.type).toEqual({ names: ['number'] }) // memberof '.' → falls back to name
  expect(data[1]?.params?.[1]?.type).toEqual({ names: ['number'] })
})

test('injectPointers: doclet with a line number absent from the pointer map gains nothing', () => {
  const data: DmdDoclet[] = [
    { kind: 'function', meta: { filename: 'f.js', lineno: 999, path: '/s/0' }, name: 'f' },
  ]
  const pointers = new Map([[1, { dist: '/abs/dist/a.js:1', src: '/abs/src/a.ts:1' }]])
  injectPointers(data, pointers)
  expect(data[0]?.mdocs).toBeUndefined()
})
