/**
 * TypeScript type extraction for `.ts` sources — the part of mdocs jsdoc
 * cannot do on its own.
 *
 * Two responsibilities:
 *
 * 1. `createTypeProgram` — one `ts.Program` per project over the project's
 *    src files (never per file) so `checker` calls are cheap and cached.
 * 2. A per-file index of call signatures keyed by plain name (`add`) and by
 *    qualified class member (`Point.translate`, `Point.constructor`) used by
 *    `lookupSymbol` to enrich jsdoc doclets.
 *
 * Errors never escape this module: a file whose AST/checker blows up simply
 * contributes an empty index, and the doclet keeps whatever jsdoc carried.
 */
import { resolve } from 'node:path'
import ts from 'typescript'

/** Lookup keys for one doclet: qualified (`Class.member`) preferred, plain fallback. */
export interface SymbolLookup {
  /** Plain symbol name, e.g. `translate`. */
  name: string
  /** Qualified class-member key, e.g. `Point.translate`. */
  qualified?: string
}

/** Extracted call-signature types for one named symbol. */
export interface SymbolType {
  /** Parameter types in signature order. */
  params: SymbolParam[]
  /** Checker-printed return type, e.g. `number` or `{ a: number; b: number }`. */
  returnType: string
}

/** A source program plus its per-file type index. */
export interface TypeProgram {
  readonly byFile: Map<string, FileTypeIndex>
  readonly checker: ts.TypeChecker
  readonly program: ts.Program
}

/** Per-file index over the project's type program. */
interface FileTypeIndex {
  /** Plain name → matches (length > 1 means ambiguous, rejected on lookup). */
  byName: Map<string, SymbolType[]>
  /** Qualified keys: `Class.member` / `Class.constructor` / `Class.getProp`. */
  byQualified: Map<string, SymbolType>
}

type FunctionLike =
  | ts.ArrowFunction
  | ts.ConstructorDeclaration
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.GetAccessorDeclaration
  | ts.MethodDeclaration

/** Parameter type extracted for one signature parameter. */
interface SymbolParam {
  /** Parameter name as written in the signature. */
  name: string
  /** Checker-printed type text, e.g. `string` or `{ a: number; b: number }`. */
  type: string
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Builds the shared program for `files` (.ts family only). Compiler options
 * are deliberately lenient: the program exists to read types, not to
 * type-check, so diagnostics are ignored.
 * @param files - The `.ts` family files to include in the program.
 * @returns The shared program, or `null` for an empty file list.
 */
export function createTypeProgram(files: readonly string[]): null | TypeProgram {
  if (files.length === 0) return null
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: false,
    target: ts.ScriptTarget.ESNext,
    types: [],
  }
  let program: ts.Program
  /* v8 ignore next 3 — createProgram with our fixed options never throws for user source files; it tolerates missing/unreadable inputs by skipping them. */
  try {
    program = ts.createProgram(files as string[], options)
  } catch {
    return null
  }
  const checker = program.getTypeChecker()
  const byFile = new Map<string, FileTypeIndex>()

  for (const fileName of files) {
    const sourceFile = program.getSourceFile(fileName)
    if (sourceFile === undefined) continue
    byFile.set(resolve(fileName), collectTypesFromSourceFile(sourceFile, checker))
  }
  return { byFile, checker, program }
}

/**
 * Looks up extracted types for a doclet. Qualified lookup wins; a plain-name
 * match is used only when it is unambiguous within the file. Returns `null`
 * when nothing usable was found.
 * @param program - The shared type program.
 * @param srcAbsPath - Absolute path of the source file to look up.
 * @param lookup - Qualified-first lookup keys for the doclet.
 * @returns The extracted types, or `null` when nothing usable was found.
 */
export function lookupSymbol(program: TypeProgram, srcAbsPath: string, lookup: SymbolLookup): null | SymbolType {
  const index = program.byFile.get(resolve(srcAbsPath))
  if (index === undefined) return null
  if (lookup.qualified !== undefined) {
    const hit = index.byQualified.get(lookup.qualified)
    if (hit !== undefined) return hit
  }
  const plain = index.byName.get(lookup.name)
  return plain?.length === 1 ? (plain[0] as SymbolType) : null
}

/**
 * Every identifier bound inside a (possibly nested) object/array pattern.
 * @param pattern - The binding pattern to walk.
 * @param out - Accumulator (recursion carries it) — name + declaring node.
 * @returns The bound leaves (name + node), in source order.
 */
function boundLeaves(
  pattern: ts.ArrayBindingPattern | ts.ObjectBindingPattern,
  out: Array<{ name: string; node: ts.BindingElement }> = [],
): Array<{ name: string; node: ts.BindingElement }> {
  for (const element of pattern.elements) {
    /* v8 ignore next 1 — binding pattern elements are always BindingElements. */
    if (!ts.isBindingElement(element)) continue
    const name = element.name
    if (
      element.propertyName !== undefined &&
      (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName))
    ) {
      out.push({ name: element.propertyName.text, node: element })
    } else if (ts.isIdentifier(name)) {
      out.push({ name: name.text, node: element })
    } else {
      out.push({ name: name.getText(), node: element })
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      boundLeaves(name, out)
    }
  }
  return out
}

/**
 * Collects named callables hidden in variable/property declarations.
 * @param node - The AST node to inspect.
 * @returns The callee signature and name, or `null` when `node` is not a call-typed declaration.
 */
function callableVariable(node: ts.Node): null | { fn: ts.ArrowFunction | ts.FunctionExpression; name: string } {
  const isVariable = ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
  const isProperty = ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)
  if (!isVariable && !isProperty) return null
  const name = node.name as ts.Identifier
  const initializer = node.initializer
  if (initializer === undefined) return null
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return { fn: initializer, name: name.text }
  }
  return null
}

/**
 * Parameter/property entries for a signature, expanding destructured patterns.
 * @param parameters - The signature's parameter declarations.
 * @param enclosing - The node to use for contextual type printing.
 * @param checker - The type checker.
 * @param sourceFile - The source file, for declaration emit of destructured types.
 * @param flags - The type-to-string flags to use.
 * @returns The extracted parameter types, in signature order.
 */
function collectParamTypes(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  enclosing: ts.Node,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  flags: ts.TypeFormatFlags,
): SymbolParam[] {
  const params: SymbolParam[] = []
  for (const parameter of parameters) {
    if (ts.isIdentifier(parameter.name)) {
      params.push({ name: parameter.name.text, type: typeString(parameter, enclosing, checker, flags) })
      continue
    }
    // Destructured patterns: one row under their source text, plus one row
    // per bound leaf so doclets that document the leaves can be typed.
    params.push({ name: parameter.name.getText(sourceFile), type: typeString(parameter, enclosing, checker, flags) })
    for (const leaf of boundLeaves(parameter.name)) {
      params.push({ name: leaf.name, type: typeString(leaf.node, enclosing, checker, flags) })
    }
  }
  return params
}

/**
 * Walks the AST, extracting call signatures for every named function-like node.
 * @param sourceFile - The source file to walk.
 * @param checker - The type checker.
 * @returns The per-file type index.
 */
function collectTypesFromSourceFile(sourceFile: ts.SourceFile, checker: ts.TypeChecker): FileTypeIndex {
  const index: FileTypeIndex = { byName: new Map(), byQualified: new Map() }

  const visit = (node: ts.Node, enclosingClass: null | string): void => {
    const className = enclosingClassOf(node, enclosingClass)
    recordExtracted(index, node, checker, sourceFile, className)
    ts.forEachChild(node, (child) => visit(child, className))
  }

  visit(sourceFile, null)
  return index
}

/**
 * The enclosing class name when `node` introduces one (else input unchanged).
 * @param node - The AST node being visited.
 * @param enclosingClass - The class name being tracked, or `null`.
 * @returns The class scope to use for `node`'s subtree.
 */
function enclosingClassOf(node: ts.Node, enclosingClass: null | string): null | string {
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name !== undefined) {
    return node.name.text
  }
  return enclosingClass
}


/**
 * Extracts parameter/return types via the type checker.
 * @param node - The function-like declaration to extract from.
 * @param checker - The type checker.
 * @param sourceFile - The source file, for contextual type printing.
 * @returns The extracted parameter/return types (`any` when no signature exists).
 */
function extractSignature(node: FunctionLike, checker: ts.TypeChecker, sourceFile: ts.SourceFile): SymbolType {
  const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType
  const signature = checker.getSignatureFromDeclaration(node)
  /* v8 ignore next 1 — only call-like declarations reach here; getSignatureFromDeclaration always yields a signature for those. */
  if (signature === undefined) return { params: [], returnType: 'any' }
  const params = collectParamTypes(node.parameters, node, checker, sourceFile, flags)
  const returnType = checker.typeToString(checker.getReturnTypeOfSignature(signature), node, flags)
  return { params, returnType }
}

/**
 * Named function-like declaration, e.g. `function translate() {}` or a method.
 * @param node - The AST node to classify.
 * @returns The declaration and its name, or `null` when not nameable.
 */
function functionLikeEntry(node: ts.Node): null | { fn: FunctionLike; name: string } {
  if (!isFunctionLikeWithName(node)) return null
  const name = symbolName(node)
  return name === null ? null : { fn: node, name }
}

/**
 * True for the named function-like declarations we index.
 * @param node - The AST node to classify.
 * @returns Whether `node` is a function, method, get accessor or constructor declaration.
 */
function isFunctionLikeWithName(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  )
}

/**
 * Indices a node that declares a function-like (or call-typed) member.
 * @param index - The per-file index being built.
 * @param node - The AST node to record.
 * @param checker - The type checker.
 * @param sourceFile - The source file, for contextual type printing.
 * @param className - The enclosing class name, or `null`.
 */
function recordExtracted(
  index: FileTypeIndex,
  node: ts.Node,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  className: null | string,
): void {
  const entry = functionLikeEntry(node) ?? callableVariable(node)
  if (entry === null) return
  const extracted = extractSignature(entry.fn, checker, sourceFile)
  if (className !== null) index.byQualified.set(`${className}.${entry.name}`, extracted)
  const bucket = index.byName.get(entry.name)
  if (bucket === undefined) index.byName.set(entry.name, [extracted])
  else bucket.push(extracted)
}

/**
 * Best-effort name for indexing: declaration name, else `constructor`.
 * @param node - The function-like declaration to name.
 * @returns The declaration's name, or `null` when not nameable.
 */
function symbolName(node: FunctionLike): null | string {
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  const name = node.name
  if (name === undefined) return null
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name) || ts.isPrivateIdentifier(name)) return null
  return name.getText()
}

/**
 * Type text for any node, e.g. `number` or `{ a: boolean; b: string }`.
 * @param node - The node whose type is wanted.
 * @param enclosing - The node to use for contextual type printing.
 * @param checker - The type checker.
 * @param flags - The type-to-string flags to use.
 * @returns The checker-printed type text.
 */
function typeString(node: ts.Node, enclosing: ts.Node, checker: ts.TypeChecker, flags: ts.TypeFormatFlags): string {
  return checker.typeToString(checker.getTypeAtLocation(node), enclosing, flags)
}
