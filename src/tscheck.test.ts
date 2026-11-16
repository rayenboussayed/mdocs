/**
 * Unit tests for src/tscheck.ts — the TS checker type index.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, onTestFinished, test } from 'vitest'

import { type DmdDoclet, injectCheckerTypes } from './doclet.js'
import { writeUtf8 } from './test-utils.js'
import { createTypeProgram, lookupSymbol, type SymbolLookup } from './tscheck.js'

const fixtures = join(process.cwd(), 'test', 'fixtures')

/**
 * Looks up `name` (optionally qualified) in `file` of the shared program.
 * @param program - The shared type program under test.
 * @param file - Absolute path of the fixture source.
 * @param name - The plain symbol name to look up.
 * @param qualified - The qualified lookup key (overrides the plain one).
 * @returns The extracted types, or `null`.
 */
function lookup(program: NonNullable<ReturnType<typeof createTypeProgram>>, file: string, name: string, qualified?: string) {
  const spec: SymbolLookup = qualified === undefined ? { name } : { name, qualified }
  return lookupSymbol(program, file, spec)
}

test('createTypeProgram: zero files yields null', () => {
  expect(createTypeProgram([])).toBeNull()
})

test('createTypeProgram: missing root names are tolerated, lookups return null', () => {
  const program = createTypeProgram([join(tmpdir(), 'does-not-exist-mdaics.ts')])
  expect(program).not.toBeNull()
  const hit = lookup(program as NonNullable<typeof program>, join(tmpdir(), 'does-not-exist-mdaics.ts'), 'anything')
  expect(hit).toBeNull()
})

test('module-level arrow function consts are indexed by their variable name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'fns.ts')
  await writeUtf8(src, 'export const makeEntry = (key: string, value: number): string => key + value\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'makeEntry')?.params).toEqual([
    { name: 'key', type: 'string' },
    { name: 'value', type: 'number' },
  ])
  expect(lookup(program!, src, 'makeEntry')?.returnType).toBe('string')
})

test('class fields initialized to arrow functions are indexed as qualified members', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'component.tsx')
  await writeUtf8(src, 'export class Button {\n  onClick = (event: MouseEvent): void => { void event }\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'onClick', 'Button.onClick')?.params[0]?.type).toBe('MouseEvent')
})

test('destructured object parameter properties are indexed individually', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'destructure.ts')
  await writeUtf8(
    src,
    'export function f({ title, size = 10 }: { title: string; size?: number }): string {\n  return `${title}:${size}`\n}\n',
  )
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const found = lookup(program!, src, 'f')
  expect(found).not.toBeNull()
  const byName = new Map(found!.params.map((p) => [p.name, p.type]))
  expect(byName.get('title')).toBe('string')
  expect(byName.get('size')).toContain('number')
})

test('array destructured parameters are indexed individually', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'array.ts')
  await writeUtf8(src, 'export function sum([a, b]: number[]): number {\n  return a + b\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const found = lookup(program!, src, 'sum')
  const byName = new Map(found!.params.map((p) => [p.name, p.type]))
  expect(byName.get('a')).toBe('number')
  expect(byName.get('b')).toBe('number')
})

test('nested destructured parameters are indexed individually', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'nested.ts')
  await writeUtf8(src, 'export function h({ outer: { inner } }: { outer: { inner: string } }): string {\n  return inner\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const found = lookup(program!, src, 'h')
  const byName = new Map(found!.params.map((p) => [p.name, p.type]))
  expect(byName.get('inner')).toBe('string')
})

test('classes with the same member name stay ambiguous for plain lookups', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'ambiguous.ts')
  await writeUtf8(src, 'class A { m(): number { return 1 } }\nclass B { m(): string { return "b" } }\nexport { A, B }\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'm')).toBeNull() // ambiguous → rejected
  expect(lookup(program!, src, 'm', 'A.m')?.returnType).toBe('number')
  expect(lookup(program!, src, 'm', 'B.m')?.returnType).toBe('string')
})

test('qualified miss falls back to the plain-name index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'fallback.ts')
  await writeUtf8(src, 'export function add(a: number, b: number): number {\n  return a + b\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'add', 'Nope.add')?.returnType).toBe('number')
})

test('files absent from the program return null, not an error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(fixtures, 'regular-repo-ts', 'src', 'math.ts')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, '/elsewhere/other.ts', 'add')).toBeNull()
})

test('private and computed member names are not indexed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'declared.ts')
  await writeUtf8(src, 'export class C {\n  #hidden(): number { return 1 }\n  ["computed"](): string { return "x" }\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'hidden', 'C.hidden')).toBeNull()
  expect(lookup(program!, src, 'computed', 'C.computed')).toBeNull()
})

test('get accessor members are indexed as methods', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'accessor.ts')
  await writeUtf8(src, 'export class C {\n  get area(): number { return 42 }\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'area', 'C.area')?.returnType).toBe('number')
})

test('syntactically broken .ts files do not crash the program; injection stays best-effort', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'broken.ts')
  await writeUtf8(src, 'export function broken(a: (((b {\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  // The garbage input may or may not produce usable signature entries —
  // what must hold is that injection is a no-throw no-op, never a crash.
  expect(() => {
    const data: DmdDoclet[] = [
      { kind: 'function', name: 'broken', params: [{ name: 'a' }], returns: [{ description: 'x' }] },
    ]
    injectCheckerTypes(data, program, src)
  }).not.toThrow()
})

test('string-literal method names are indexed by their source text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'string-name.ts')
  await writeUtf8(src, 'export class C {\n  "my-prop"(): number { return 1 }\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'my-prop', 'C.my-prop')?.returnType).toBe('number')
})

test('two class fields with the same arrow-function name stay ambiguous for plain lookups', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'dupe-fields.ts')
  await writeUtf8(src, 'class A { render = (): number => 1 }\nclass B { render = (): string => "b" }\nexport { A, B }\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'render')).toBeNull()
  expect(lookup(program!, src, 'render', 'A.render')?.returnType).toBe('number')
})

test('array-of-arrays destructuring indexes nested leaves', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'array-of-arrays.ts')
  await writeUtf8(src, 'export function g([[a, b], c]: number[][]): number {\n  return a + b + c\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const found = lookup(program!, src, 'g')
  const byName = new Map(found!.params.map((p) => [p.name, p.type]))
  expect(byName.get('a')).toBe('number')
  expect(byName.get('b')).toBe('number')
  expect(byName.get('c')).toBe('number[]')
})

test('string-literal property names in destructuring are indexed by their key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'string-props.ts')
  await writeUtf8(src, 'export function f({ "my-prop": value }: { "my-prop": string }): string {\n  return value\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  const found = lookup(program!, src, 'f')
  const byName = new Map(found!.params.map((p) => [p.name, p.type]))
  expect(byName.get('my-prop')).toBe('string')
})

test('class fields with computed names and private identifiers are not indexed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'private-computed.ts')
  await writeUtf8(src, 'export class C {\n  #hidden = (): number => 1\n  ["computed"] = (): string => "s"\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'hidden', 'C.hidden')).toBeNull()
  expect(lookup(program!, src, 'computed', 'C.computed')).toBeNull()
})

test('numeric-literal method names are indexed by their source text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'numeric.ts')
  await writeUtf8(src, 'export class C {\n  42(): number { return 42 }\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, '42', 'C.42')?.returnType).toBe('number')
})

test('anonymous default-export functions are skipped without crashing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'anonymous.ts')
  await writeUtf8(src, 'export default function () {\n  return 1\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'anonymous')).toBeNull()
})

test('class fields without initializers are not indexed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdaics-tscheck-'))
  onTestFinished(() => rm(dir, { force: true, recursive: true }))
  const src = join(dir, 'uninitialized.ts')
  await writeUtf8(src, 'export class Empty {\n  callback: () => void\n}\n')
  const program = createTypeProgram([src])
  expect(program).not.toBeNull()
  expect(lookup(program!, src, 'callback', 'Empty.callback')).toBeNull()
})
