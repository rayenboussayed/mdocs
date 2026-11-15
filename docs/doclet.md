## Constants

<dl>
<dt><a href="#VOID_RETURN">VOID_RETURN</a></dt>
<dd><p>Matches <code>void</code> and <code>void | undefined</code> return types (no <code>@returns</code> needed).</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#injectCheckerTypes">injectCheckerTypes(doclets, program, srcAbsPath)</a></dt>
<dd><p>Fills in/upgrades parameter and return types from the TypeScript checker.
Only applied to <code>.ts</code>-family sources; JS files keep their JSDoc annotations.</p>
<p>Semantics:</p>
<ul>
<li>Every documented parameter gets its <code>type.names</code> replaced by the checker
type (TS is the source of truth for <code>.ts</code> files) when a same-named
parameter exists in the signature.</li>
<li>The return type is always upgraded to the checker&#39;s return type; if the
doclet has no <code>@returns</code> but the function returns a non-<code>void</code> type, a
returns entry is added.</li>
</ul>
</dd>
<dt><a href="#injectCheckerType">injectCheckerType(doclet, program, srcAbsPath)</a></dt>
<dd><p>Applies the checker types to one doclet, when both sides exist.</p>
</dd>
<dt><a href="#upgradeParamTypes">upgradeParamTypes(doclet, info)</a></dt>
<dd><p>Replaces each same-named parameter&#39;s JSDoc type with the checker&#39;s type.</p>
</dd>
<dt><a href="#injectPointers">injectPointers(doclets, pointers)</a></dt>
<dd><p>Attaches the <code>src</code>/<code>dist</code> pointer to every doclet. <code>pointers</code> maps a
doclet&#39;s identity (its <code>meta.lineno</code> in the generated file) — see the
resolve/render pipeline for how it is built.</p>
</dd>
<dt><a href="#normalizeDoclets">normalizeDoclets(data)</a> ⇒ <code>DmdDoclet[]</code></dt>
<dd><p>Normalizes dmd input doclets in place.</p>
<ol>
<li>For ES-module sources without a <code>@module</code> tag (the common case), jsdoc
emits top-level class doclets whose <code>memberof</code> points at themselves
(<code>id === memberof</code>). dmd&#39;s <code>#orphans</code> selector requires <code>memberof</code> to be
absent, so those symbols never render. Undoing the self-parenting makes
them render as top-level symbols; class children keep their (non-self)
<code>memberof</code> so nesting still works. (A constructor&#39;s <code>memberof</code> equals
the class longname but NOT its own <code>id</code> — <code>Point()</code> ≠ <code>Point</code> — so
constructors are unaffected.)</li>
<li>Strips the ESM <code>exports.</code> prefix jsdoc 4 leaves on doclet names
(<code>exports.Point</code> → <code>Point</code>) by preferring <code>longname</code> when present.</li>
</ol>
</dd>
<dt><a href="#extractLookupKeys">extractLookupKeys(doclet)</a> ⇒ <code>SymbolLookup</code></dt>
<dd><p>Extracts the qualified (<code>Class.member</code>) and plain lookup keys for a doclet.</p>
</dd>
<dt><a href="#memberofBase">memberofBase(memberof)</a> ⇒ <code>string</code></dt>
<dd><p>Extracts the class base from a jsdoc <code>memberof</code> value (<code>module:f.Point</code> → <code>Point</code>).</p>
</dd>
<dt><a href="#upgradeReturnType">upgradeReturnType(doclet, info)</a></dt>
<dd><p>Upgrades (or adds) the doclet&#39;s <code>@returns</code> entry from the checker type.</p>
</dd>
</dl>

<a name="VOID_RETURN"></a>

## VOID\_RETURN
Matches `void` and `void | undefined` return types (no `@returns` needed).

**Kind**: global constant  
src: src/doclet.ts:112  
dist: dist/doclet.js:71
<a name="injectCheckerTypes"></a>

## injectCheckerTypes(doclets, program, srcAbsPath)
Fills in/upgrades parameter and return types from the TypeScript checker.
Only applied to `.ts`-family sources; JS files keep their JSDoc annotations.

Semantics:
- Every documented parameter gets its `type.names` replaced by the checker
  type (TS is the source of truth for `.ts` files) when a same-named
  parameter exists in the signature.
- The return type is always upgraded to the checker's return type; if the
  doclet has no `@returns` but the function returns a non-`void` type, a
  returns entry is added.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| doclets | <code>readonly DmdDoclet[]</code> | The doclets to enrich (mutated in place). |
| program | <code>TypeProgram</code> | The project's shared type program. |
| srcAbsPath | <code>string</code> | Absolute path of the source file the doclets came from. |

src: src/doclet.ts:72  
dist: dist/doclet.js:32
<a name="injectCheckerType"></a>

## injectCheckerType(doclet, program, srcAbsPath)
Applies the checker types to one doclet, when both sides exist.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| doclet | <code>DmdDoclet</code> | The doclet to enrich (mutated in place). |
| program | <code>TypeProgram</code> | The project's shared type program. |
| srcAbsPath | <code>string</code> | Absolute path of the source file the doclet came from. |

src: src/doclet.ts:87  
dist: dist/doclet.js:44
<a name="upgradeParamTypes"></a>

## upgradeParamTypes(doclet, info)
Replaces each same-named parameter's JSDoc type with the checker's type.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| doclet | <code>DmdDoclet</code> | The doclet whose `params` are upgraded (mutated in place). |
| info | <code>SymbolType</code> | The extracted signature for the doclet's symbol. |

src: src/doclet.ts:101  
dist: dist/doclet.js:59
<a name="injectPointers"></a>

## injectPointers(doclets, pointers)
Attaches the `src`/`dist` pointer to every doclet. `pointers` maps a
doclet's identity (its `meta.lineno` in the generated file) — see the
resolve/render pipeline for how it is built.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| doclets | <code>readonly DmdDoclet[]</code> | The doclets to annotate (mutated in place). |
| pointers | <code>ReadonlyMap&lt;number, SymbolPointer&gt;</code> | `meta.lineno` → pointer, produced by the render pipeline. |

src: src/doclet.ts:121  
dist: dist/doclet.js:79
<a name="normalizeDoclets"></a>

## normalizeDoclets(data) ⇒ <code>DmdDoclet[]</code>
Normalizes dmd input doclets in place.

1. For ES-module sources without a `@module` tag (the common case), jsdoc
   emits top-level class doclets whose `memberof` points at themselves
   (`id === memberof`). dmd's `#orphans` selector requires `memberof` to be
   absent, so those symbols never render. Undoing the self-parenting makes
   them render as top-level symbols; class children keep their (non-self)
   `memberof` so nesting still works. (A constructor's `memberof` equals
   the class longname but NOT its own `id` — `Point()` ≠ `Point` — so
   constructors are unaffected.)
2. Strips the ESM `exports.` prefix jsdoc 4 leaves on doclet names
   (`exports.Point` → `Point`) by preferring `longname` when present.

**Kind**: global function  
**Returns**: <code>DmdDoclet[]</code> - The same array, normalized.  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>DmdDoclet[]</code> | The doclets to normalize (mutated in place). |

src: src/doclet.ts:147  
dist: dist/doclet.js:106
<a name="extractLookupKeys"></a>

## extractLookupKeys(doclet) ⇒ <code>SymbolLookup</code>
Extracts the qualified (`Class.member`) and plain lookup keys for a doclet.

**Kind**: global function  
**Returns**: <code>SymbolLookup</code> - The qualified-first lookup keys, or `null` when the doclet is not nameable.  

| Param | Type | Description |
| --- | --- | --- |
| doclet | <code>DmdDoclet</code> | The doclet to name. |

src: src/doclet.ts:164  
dist: dist/doclet.js:122
<a name="memberofBase"></a>

## memberofBase(memberof) ⇒ <code>string</code>
Extracts the class base from a jsdoc `memberof` value (`module:f.Point` → `Point`).

**Kind**: global function  
**Returns**: <code>string</code> - The class base, or `null` when empty.  

| Param | Type | Description |
| --- | --- | --- |
| memberof | <code>string</code> | The raw `memberof` value. |

src: src/doclet.ts:185  
dist: dist/doclet.js:143
<a name="upgradeReturnType"></a>

## upgradeReturnType(doclet, info)
Upgrades (or adds) the doclet's `@returns` entry from the checker type.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| doclet | <code>DmdDoclet</code> | The doclet whose `returns` are upgraded (mutated in place). |
| info | <code>SymbolType</code> | The extracted signature for the doclet's symbol. |

src: src/doclet.ts:197  
dist: dist/doclet.js:155
