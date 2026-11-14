/**
 * Shared operations on the "template data" doclets produced by jsdoc-parse
 * (via `jsdoc2md.getTemplateData`) and consumed by dmd.
 *
 * jsdoc-parse already normalizes the noisy parts of `jsdoc -X` output (it
 * drops undocumented/package/file doclets, fixes constructor longnames, …),
 * so this module only adds what is specific to mdocs:
 *
 * - the per-symbol `src`/`dist` pointer injection (`injectPointers`),
 * - merging checker-derived TypeScript types into parameter/return entries
 *   (`injectCheckerTypes`).
 *
 * Both mutate the doclet objects in place — the data is fresh from
 * `getTemplateData` and is not shared.
 */
import { lookupSymbol, type SymbolLookup, type SymbolType, type TypeProgram } from './tscheck.js'

/** A doclet as emitted by jsdoc-parse (subset of fields dmd reads). */
export interface DmdDoclet {
  [field: string]: unknown
  codeName?: string
  id?: string
  kind?: string
  longname?: string
  /** Injected by mdocs: absolute `src` / `dist` pointers for the heading. */
  mdocs?: { dist: string; src: string; }
  memberof?: string
  meta?: {
    [field: string]: unknown
    columnno?: number
    filename?: string
    lineno?: number
    path?: string
  }
  name?: string
  params?: Array<{
    [field: string]: unknown
    defaultvalue?: unknown
    description?: string
    name?: string
    optional?: boolean
    type?: { names?: string[] }
  }>
  properties?: Array<{ description?: string; name?: string; type?: { names?: string[] } }>
  returns?: Array<{ description?: string; type?: { names?: string[] } }>
  scope?: string
}

/** The line pointers computed for one documented symbol. */
export interface SymbolPointer {
  /** `<cwd-relative dist>/file.js:10` or `/abs/path/dist/file.js` + ` (approx.)` when the line is unknown. */
  dist: string
  /** `src/file.ts:19` or with ` (approx.)` suffix. */
  src: string
}

/**
 * Fills in/upgrades parameter and return types from the TypeScript checker.
 * Only applied to `.ts`-family sources; JS files keep their JSDoc annotations.
 *
 * Semantics:
 * - Every documented parameter gets its `type.names` replaced by the checker
 *   type (TS is the source of truth for `.ts` files) when a same-named
 *   parameter exists in the signature.
 * - The return type is always upgraded to the checker's return type; if the
 *   doclet has no `@returns` but the function returns a non-`void` type, a
 *   returns entry is added.
 * @param doclets - The doclets to enrich (mutated in place).
 * @param program - The project's shared type program.
 * @param srcAbsPath - Absolute path of the source file the doclets came from.
 */
export function injectCheckerTypes(
  doclets: readonly DmdDoclet[],
  program: null | TypeProgram,
  srcAbsPath: string,
): void {
  if (program === null) return
  for (const doclet of doclets) injectCheckerType(doclet, program, srcAbsPath)
}

/**
 * Applies the checker types to one doclet, when both sides exist.
 * @param doclet - The doclet to enrich (mutated in place).
 * @param program - The project's shared type program.
 * @param srcAbsPath - Absolute path of the source file the doclet came from.
 */
function injectCheckerType(doclet: DmdDoclet, program: TypeProgram, srcAbsPath: string): void {
  const lookup = extractLookupKeys(doclet)
  if (lookup === null) return
  const info = lookupSymbol(program, srcAbsPath, lookup)
  if (info === null) return
  upgradeParamTypes(doclet, info)
  upgradeReturnType(doclet, info)
}

/**
 * Replaces each same-named parameter's JSDoc type with the checker's type.
 * @param doclet - The doclet whose `params` are upgraded (mutated in place).
 * @param info - The extracted signature for the doclet's symbol.
 */
function upgradeParamTypes(doclet: DmdDoclet, info: SymbolType): void {
  if (!Array.isArray(doclet.params) || info.params.length === 0) return
  const byName = new Map(info.params.map((param) => [param.name, param.type]))
  for (const param of doclet.params) {
    const tsType = param.name === undefined ? undefined : byName.get(param.name)
    // The checker's `any` carries no information — keep the JSDoc type.
    if (tsType !== undefined && tsType !== 'any') param.type = { names: [tsType] }
  }
}

/** Matches `void` and `void | undefined` return types (no `@returns` needed). */
const VOID_RETURN = /^void(?:$|\s*\||undefined)/

/**
 * Attaches the `src`/`dist` pointer to every doclet. `pointers` maps a
 * doclet's identity (its `meta.lineno` in the generated file) — see the
 * resolve/render pipeline for how it is built.
 * @param doclets - The doclets to annotate (mutated in place).
 * @param pointers - `meta.lineno` → pointer, produced by the render pipeline.
 */
export function injectPointers(doclets: readonly DmdDoclet[], pointers: ReadonlyMap<number, SymbolPointer>): void {
  for (const doclet of doclets) {
    const line = doclet.meta?.lineno
    if (line === undefined) continue
    const pointer = pointers.get(line)
    if (pointer !== undefined) doclet.mdocs = { dist: pointer.dist, src: pointer.src }
  }
}

/**
 * Normalizes dmd input doclets in place.
 *
 * 1. For ES-module sources without a `@module` tag (the common case), jsdoc
 *    emits top-level class doclets whose `memberof` points at themselves
 *    (`id === memberof`). dmd's `#orphans` selector requires `memberof` to be
 *    absent, so those symbols never render. Undoing the self-parenting makes
 *    them render as top-level symbols; class children keep their (non-self)
 *    `memberof` so nesting still works. (A constructor's `memberof` equals
 *    the class longname but NOT its own `id` — `Point()` ≠ `Point` — so
 *    constructors are unaffected.)
 * 2. Strips the ESM `exports.` prefix jsdoc 4 leaves on doclet names
 *    (`exports.Point` → `Point`) by preferring `longname` when present.
 * @param data - The doclets to normalize (mutated in place).
 * @returns The same array, normalized.
 */
export function normalizeDoclets(data: DmdDoclet[]): DmdDoclet[] {
  for (const doclet of data) {
    if (doclet.memberof !== undefined && doclet.memberof === doclet.id) {
      delete doclet.memberof
    }
    if (typeof doclet.name === 'string' && doclet.name.startsWith('exports.') && typeof doclet.longname === 'string' && doclet.longname !== '') {
      doclet.name = doclet.longname
    }
  }
  return data
}

/**
 * Extracts the qualified (`Class.member`) and plain lookup keys for a doclet.
 * @param doclet - The doclet to name.
 * @returns The qualified-first lookup keys, or `null` when the doclet is not nameable.
 */
function extractLookupKeys(doclet: DmdDoclet): null | SymbolLookup {
  const name = doclet.name ?? doclet.longname
  if (name === undefined || name.trim() === '') return null
  // Class doclets hold the constructor signature's parameters; constructor
  // doclets do too (they carry the class's @param tags, no types).
  if (doclet.kind === 'class' || doclet.kind === 'constructor') {
    const className = doclet.kind === 'constructor' ? memberofBase(doclet.memberof) ?? name : name
    return { name, qualified: `${className}.constructor` }
  }
  const className = memberofBase(doclet.memberof)
  if (className !== null && className !== name) {
    return { name, qualified: `${className}.${name}` }
  }
  return { name }
}

/**
 * Extracts the class base from a jsdoc `memberof` value (`module:f.Point` → `Point`).
 * @param memberof - The raw `memberof` value.
 * @returns The class base, or `null` when empty.
 */
function memberofBase(memberof: string | undefined): null | string {
  if (memberof === undefined) return null
  const tail = memberof.split(/[.#~]/u).pop() as string
  const clean = tail.replace(/^module:/u, '')
  return clean === '' ? null : clean
}

/**
 * Upgrades (or adds) the doclet's `@returns` entry from the checker type.
 * @param doclet - The doclet whose `returns` are upgraded (mutated in place).
 * @param info - The extracted signature for the doclet's symbol.
 */
function upgradeReturnType(doclet: DmdDoclet, info: SymbolType): void {
  if (info.returnType === 'any') return
  if (Array.isArray(doclet.returns) && doclet.returns.length > 0) {
    for (const entry of doclet.returns) entry.type = { names: [info.returnType] }
    return
  }
  if (doclet.kind === 'class' || doclet.kind === 'module' || VOID_RETURN.test(info.returnType)) return
  doclet.returns = [{ type: { names: [info.returnType] } }]
}
