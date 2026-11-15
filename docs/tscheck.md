## Functions

<dl>
<dt><a href="#createTypeProgram">createTypeProgram(files)</a> ⇒ <code>TypeProgram</code></dt>
<dd><p>Builds the shared program for <code>files</code> (.ts family only). Compiler options
are deliberately lenient: the program exists to read types, not to
type-check, so diagnostics are ignored.</p>
</dd>
<dt><a href="#lookupSymbol">lookupSymbol(program, srcAbsPath, lookup)</a> ⇒ <code>SymbolType</code></dt>
<dd><p>Looks up extracted types for a doclet. Qualified lookup wins; a plain-name
match is used only when it is unambiguous within the file. Returns <code>null</code>
when nothing usable was found.</p>
</dd>
<dt><a href="#boundLeaves">boundLeaves(pattern, out)</a> ⇒ <code>{ name: string; node: ts.BindingElement; }[]</code></dt>
<dd><p>Every identifier bound inside a (possibly nested) object/array pattern.</p>
</dd>
<dt><a href="#callableVariable">callableVariable(node)</a> ⇒ <code>{ fn: ts.ArrowFunction | ts.FunctionExpression; name: string; }</code></dt>
<dd><p>Collects named callables hidden in variable/property declarations.</p>
</dd>
<dt><a href="#collectParamTypes">collectParamTypes(parameters, enclosing, checker, sourceFile, flags)</a> ⇒ <code>SymbolParam[]</code></dt>
<dd><p>Parameter/property entries for a signature, expanding destructured patterns.</p>
</dd>
<dt><a href="#collectTypesFromSourceFile">collectTypesFromSourceFile(sourceFile, checker)</a> ⇒ <code>FileTypeIndex</code></dt>
<dd><p>Walks the AST, extracting call signatures for every named function-like node.</p>
</dd>
<dt><a href="#enclosingClassOf">enclosingClassOf(node, enclosingClass)</a> ⇒ <code>string</code></dt>
<dd><p>The enclosing class name when <code>node</code> introduces one (else input unchanged).</p>
</dd>
<dt><a href="#extractSignature">extractSignature(node, checker, sourceFile)</a> ⇒ <code>SymbolType</code></dt>
<dd><p>Extracts parameter/return types via the type checker.</p>
</dd>
<dt><a href="#functionLikeEntry">functionLikeEntry(node)</a> ⇒ <code>{ fn: FunctionLike; name: string; }</code></dt>
<dd><p>Named function-like declaration, e.g. <code>function translate() {}</code> or a method.</p>
</dd>
<dt><a href="#isFunctionLikeWithName">isFunctionLikeWithName(node)</a> ⇒ <code>boolean</code></dt>
<dd><p>True for the named function-like declarations we index.</p>
</dd>
<dt><a href="#recordExtracted">recordExtracted(index, node, checker, sourceFile, className)</a></dt>
<dd><p>Indices a node that declares a function-like (or call-typed) member.</p>
</dd>
<dt><a href="#symbolName">symbolName(node)</a> ⇒ <code>string</code></dt>
<dd><p>Best-effort name for indexing: declaration name, else <code>constructor</code>.</p>
</dd>
<dt><a href="#typeString">typeString(node, enclosing, checker, flags)</a> ⇒ <code>string</code></dt>
<dd><p>Type text for any node, e.g. <code>number</code> or <code>{ a: boolean; b: string }</code>.</p>
</dd>
</dl>

<a name="createTypeProgram"></a>

## createTypeProgram(files) ⇒ <code>TypeProgram</code>
Builds the shared program for `files` (.ts family only). Compiler options
are deliberately lenient: the program exists to read types, not to
type-check, so diagnostics are ignored.

**Kind**: global function  
**Returns**: <code>TypeProgram</code> - The shared program, or `null` for an empty file list.  

| Param | Type | Description |
| --- | --- | --- |
| files | <code>readonly string[]</code> | The `.ts` family files to include in the program. |

src: src/tscheck.ts:77  
dist: dist/tscheck.js:28
<a name="lookupSymbol"></a>

## lookupSymbol(program, srcAbsPath, lookup) ⇒ <code>SymbolType</code>
Looks up extracted types for a doclet. Qualified lookup wins; a plain-name
match is used only when it is unambiguous within the file. Returns `null`
when nothing usable was found.

**Kind**: global function  
**Returns**: <code>SymbolType</code> - The extracted types, or `null` when nothing usable was found.  

| Param | Type | Description |
| --- | --- | --- |
| program | <code>TypeProgram</code> | The shared type program. |
| srcAbsPath | <code>string</code> | Absolute path of the source file to look up. |
| lookup | <code>SymbolLookup</code> | Qualified-first lookup keys for the doclet. |

src: src/tscheck.ts:117  
dist: dist/tscheck.js:69
<a name="boundLeaves"></a>

## boundLeaves(pattern, out) ⇒ <code>{ name: string; node: ts.BindingElement; }[]</code>
Every identifier bound inside a (possibly nested) object/array pattern.

**Kind**: global function  
**Returns**: <code>{ name: string; node: ts.BindingElement; }[]</code> - The bound leaves (name + node), in source order.  

| Param | Type | Description |
| --- | --- | --- |
| pattern | <code>ts.ArrayBindingPattern \| ts.ObjectBindingPattern</code> | The binding pattern to walk. |
| out | <code>{ name: string; node: ts.BindingElement; }[]</code> | Accumulator (recursion carries it) — name + declaring node. |

src: src/tscheck.ts:134  
dist: dist/tscheck.js:87
<a name="callableVariable"></a>

## callableVariable(node) ⇒ <code>{ fn: ts.ArrowFunction \| ts.FunctionExpression; name: string; }</code>
Collects named callables hidden in variable/property declarations.

**Kind**: global function  
**Returns**: <code>{ fn: ts.ArrowFunction \| ts.FunctionExpression; name: string; }</code> - The callee signature and name, or `null` when `node` is not a call-typed declaration.  

| Param | Type | Description |
| --- | --- | --- |
| node | <code>ts.Node</code> | The AST node to inspect. |

src: src/tscheck.ts:164  
dist: dist/tscheck.js:114
<a name="collectParamTypes"></a>

## collectParamTypes(parameters, enclosing, checker, sourceFile, flags) ⇒ <code>SymbolParam[]</code>
Parameter/property entries for a signature, expanding destructured patterns.

**Kind**: global function  
**Returns**: <code>SymbolParam[]</code> - The extracted parameter types, in signature order.  

| Param | Type | Description |
| --- | --- | --- |
| parameters | <code>ts.NodeArray&lt;ts.ParameterDeclaration&gt;</code> | The signature's parameter declarations. |
| enclosing | <code>ts.Node</code> | The node to use for contextual type printing. |
| checker | <code>ts.TypeChecker</code> | The type checker. |
| sourceFile | <code>ts.SourceFile</code> | The source file, for declaration emit of destructured types. |
| flags | <code>ts.TypeFormatFlags</code> | The type-to-string flags to use. |

src: src/tscheck.ts:186  
dist: dist/tscheck.js:137
<a name="collectTypesFromSourceFile"></a>

## collectTypesFromSourceFile(sourceFile, checker) ⇒ <code>FileTypeIndex</code>
Walks the AST, extracting call signatures for every named function-like node.

**Kind**: global function  
**Returns**: <code>FileTypeIndex</code> - The per-file type index.  

| Param | Type | Description |
| --- | --- | --- |
| sourceFile | <code>ts.SourceFile</code> | The source file to walk. |
| checker | <code>ts.TypeChecker</code> | The type checker. |

src: src/tscheck.ts:215  
dist: dist/tscheck.js:159
<a name="enclosingClassOf"></a>

## enclosingClassOf(node, enclosingClass) ⇒ <code>string</code>
The enclosing class name when `node` introduces one (else input unchanged).

**Kind**: global function  
**Returns**: <code>string</code> - The class scope to use for `node`'s subtree.  

| Param | Type | Description |
| --- | --- | --- |
| node | <code>ts.Node</code> | The AST node being visited. |
| enclosingClass | <code>string</code> | The class name being tracked, or `null`. |

src: src/tscheck.ts:234  
dist: dist/tscheck.js:175
<a name="extractSignature"></a>

## extractSignature(node, checker, sourceFile) ⇒ <code>SymbolType</code>
Extracts parameter/return types via the type checker.

**Kind**: global function  
**Returns**: <code>SymbolType</code> - The extracted parameter/return types (`any` when no signature exists).  

| Param | Type | Description |
| --- | --- | --- |
| node | <code>FunctionLike</code> | The function-like declaration to extract from. |
| checker | <code>ts.TypeChecker</code> | The type checker. |
| sourceFile | <code>ts.SourceFile</code> | The source file, for contextual type printing. |

src: src/tscheck.ts:249  
dist: dist/tscheck.js:188
<a name="functionLikeEntry"></a>

## functionLikeEntry(node) ⇒ <code>{ fn: FunctionLike; name: string; }</code>
Named function-like declaration, e.g. `function translate() {}` or a method.

**Kind**: global function  
**Returns**: <code>{ fn: FunctionLike; name: string; }</code> - The declaration and its name, or `null` when not nameable.  

| Param | Type | Description |
| --- | --- | --- |
| node | <code>ts.Node</code> | The AST node to classify. |

src: src/tscheck.ts:264  
dist: dist/tscheck.js:203
<a name="isFunctionLikeWithName"></a>

## isFunctionLikeWithName(node) ⇒ <code>boolean</code>
True for the named function-like declarations we index.

**Kind**: global function  
**Returns**: <code>boolean</code> - Whether `node` is a function, method, get accessor or constructor declaration.  

| Param | Type | Description |
| --- | --- | --- |
| node | <code>ts.Node</code> | The AST node to classify. |

src: src/tscheck.ts:275  
dist: dist/tscheck.js:214
<a name="recordExtracted"></a>

## recordExtracted(index, node, checker, sourceFile, className)
Indices a node that declares a function-like (or call-typed) member.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| index | <code>FileTypeIndex</code> | The per-file index being built. |
| node | <code>ts.Node</code> | The AST node to record. |
| checker | <code>ts.TypeChecker</code> | The type checker. |
| sourceFile | <code>ts.SourceFile</code> | The source file, for contextual type printing. |
| className | <code>string</code> | The enclosing class name, or `null`. |

src: src/tscheck.ts:292  
dist: dist/tscheck.js:228
<a name="symbolName"></a>

## symbolName(node) ⇒ <code>string</code>
Best-effort name for indexing: declaration name, else `constructor`.

**Kind**: global function  
**Returns**: <code>string</code> - The declaration's name, or `null` when not nameable.  

| Param | Type | Description |
| --- | --- | --- |
| node | <code>FunctionLike</code> | The function-like declaration to name. |

src: src/tscheck.ts:313  
dist: dist/tscheck.js:246
<a name="typeString"></a>

## typeString(node, enclosing, checker, flags) ⇒ <code>string</code>
Type text for any node, e.g. `number` or `{ a: boolean; b: string }`.

**Kind**: global function  
**Returns**: <code>string</code> - The checker-printed type text.  

| Param | Type | Description |
| --- | --- | --- |
| node | <code>ts.Node</code> | The node whose type is wanted. |
| enclosing | <code>ts.Node</code> | The node to use for contextual type printing. |
| checker | <code>ts.TypeChecker</code> | The type checker. |
| flags | <code>ts.TypeFormatFlags</code> | The type-to-string flags to use. |

src: src/tscheck.ts:331  
dist: dist/tscheck.js:268
