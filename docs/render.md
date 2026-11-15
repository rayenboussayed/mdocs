## Constants

<dl>
<dt><a href="#DOCS_OVERRIDE">DOCS_OVERRIDE</a></dt>
<dd><p>The two handlebars partials injected into dmd.</p>
</dd>
<dt><a href="#DIST_EXTENSION">DIST_EXTENSION</a></dt>
<dd><p>Dist extensions that differ from <code>source.slice(1)</code> (everything else strips the dot).</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#renderSourceFile">renderSourceFile(job, deps)</a> ⇒ <code>Promise&lt;RenderFileResult&gt;</code></dt>
<dd><p>Renders one source file into markdown (or reports why it could not).</p>
</dd>
<dt><a href="#writeTemplatePartials">writeTemplatePartials(scratchDir)</a> ⇒ <code>Promise&lt;string[]&gt;</code></dt>
<dd><p>Writes the two injected partials into the run&#39;s scratch directory.</p>
</dd>
<dt><a href="#computePointers">computePointers(file, data, transpileMapper, issues, pointerBase)</a> ⇒ <code>Promise&lt;Map&lt;number, SymbolPointer&gt;&gt;</code></dt>
<dd><p>Computes the per-doclet src/dist pointer map, keyed by generated line</p>
</dd>
<dt><a href="#pointerPath">pointerPath(base, absPath)</a> ⇒ <code>string</code></dt>
<dd><p>Renders an absolute path relative to the workspace root, posix-style.</p>
</dd>
<dt><a href="#prepareForJsdoc">prepareForJsdoc(file, srcText, scratchDir)</a> ⇒ <code>Promise&lt;PreparedFile&gt;</code></dt>
<dd><p>Transpiles (.ts family) or copies (.js family) the source for jsdoc.</p>
</dd>
<dt><a href="#resolveDistPointer">resolveDistPointer(srcLine, transpileMapper, dist, issues)</a> ⇒ <code>string</code></dt>
<dd><p>Computes the dist pointer for one doclet. When the dist map exists but the
lookup misses, one &quot;dist sourcemap missing or unmatched&quot; note is recorded
(the no-map/no-dist cases already got their own single note).</p>
</dd>
<dt><a href="#resolveSrcLine">resolveSrcLine(generatedLine, transpileMapper)</a> ⇒ <code>{ srcApprox: boolean; srcLine: number; }</code></dt>
<dd><p>Maps a doclet&#39;s generated line back to the original source line.</p>
</dd>
<dt><a href="#distJsPathFor">distJsPathFor(file)</a> ⇒ <code>string</code></dt>
<dd><p>dist <code>.js</code> path for a source file: sibling rootDistDir, same relative path.</p>
</dd>
<dt><a href="#distMapperFor">distMapperFor(distJs, srcAbsPath, issues)</a> ⇒ <code>Promise&lt;DistMapperResult&gt;</code></dt>
<dd><p>Reader mapper for the user&#39;s committed dist map, or <code>null</code> when missing or
referring to a different source (stale build, foreign map).</p>
</dd>
<dt><a href="#fail">fail(file, outPath, message, issues)</a> ⇒ <code>RenderFileResult</code></dt>
<dd><p>Builds the failure result shape.</p>
</dd>
<dt><a href="#noteOnce">noteOnce(issues, issue)</a></dt>
<dd><p>Adds an issue once per file.</p>
</dd>
<dt><a href="#withWarnSunk">withWarnSunk(fn)</a> ⇒ <code>Promise&lt;T&gt;</code></dt>
<dd><p>Runs <code>fn</code> with <code>console.warn</code> silenced; the patch is never re-entered concurrently.</p>
</dd>
</dl>

<a name="DOCS_OVERRIDE"></a>

## DOCS\_OVERRIDE
The two handlebars partials injected into dmd.

**Kind**: global constant  
src: src/render.ts:68  
dist: dist/render.js:40
<a name="DIST_EXTENSION"></a>

## DIST\_EXTENSION
Dist extensions that differ from `source.slice(1)` (everything else strips the dot).

**Kind**: global constant  
src: src/render.ts:354  
dist: dist/render.js:280
<a name="renderSourceFile"></a>

## renderSourceFile(job, deps) ⇒ <code>Promise&lt;RenderFileResult&gt;</code>
Renders one source file into markdown (or reports why it could not).

**Kind**: global function  
**Returns**: <code>Promise&lt;RenderFileResult&gt;</code> - The render outcome (markdown, skip or failure) — always resolves.  

| Param | Type | Description |
| --- | --- | --- |
| job | <code>RenderFileJob</code> | The file to render and its pool index. |
| deps | <code>{ outPath: string; partials: readonly string[]; pointerBase: string; scratchDir: string; timeoutMs?: number; typeProgram: null \| TypeProgram; }</code> | Render-time dependencies (scratch dir, partials, output path, TS program, pointer base, jsdoc timeout). |
| deps.scratchDir |  | Per-file scratch directory for the transpiled/copied source. |
| deps.partials |  | The handlebars partial override files (dmd template). |
| deps.outPath |  | Where the generated markdown goes. |
| deps.typeProgram |  | The project's TS program for checker types (null for JS files). |
| deps.pointerBase |  | Absolute base for cwd-relative `src:`/`dist:` pointers. |
| deps.timeoutMs |  | jsdoc render timeout in milliseconds. |

src: src/render.ts:97  
dist: dist/render.js:63
<a name="writeTemplatePartials"></a>

## writeTemplatePartials(scratchDir) ⇒ <code>Promise&lt;string[]&gt;</code>
Writes the two injected partials into the run's scratch directory.

**Kind**: global function  
**Returns**: <code>Promise&lt;string[]&gt;</code> - The absolute paths of the written partial files.  

| Param | Type | Description |
| --- | --- | --- |
| scratchDir | <code>string</code> | Scratch directory that will hold `partials/`. |

src: src/render.ts:194  
dist: dist/render.js:134
<a name="computePointers"></a>

## computePointers(file, data, transpileMapper, issues, pointerBase) ⇒ <code>Promise&lt;Map&lt;number, SymbolPointer&gt;&gt;</code>
Computes the per-doclet src/dist pointer map, keyed by generated line

**Kind**: global function  
**Returns**: <code>Promise&lt;Map&lt;number, SymbolPointer&gt;&gt;</code> - A generated-line → pointer map.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>SourceFile</code> | The source file being rendered. |
| data | <code>readonly DmdDoclet[]</code> | The doclets to annotate (already normalized). |
| transpileMapper | <code>SourceLineMapper</code> | Mapper from the in-memory transpile, or `null` for pass-through copies. |
| issues | <code>string[]</code> | Per-file notes accumulator. |
| pointerBase | <code>string</code> | Absolute base for cwd-relative `src:`/`dist:` pointers. |

src: src/render.ts:215  
dist: dist/render.js:154
<a name="pointerPath"></a>

## pointerPath(base, absPath) ⇒ <code>string</code>
Renders an absolute path relative to the workspace root, posix-style.

**Kind**: global function  
**Returns**: <code>string</code> - The posix-style relative path.  

| Param | Type | Description |
| --- | --- | --- |
| base | <code>string</code> | The absolute base the returned path is relative to. |
| absPath | <code>string</code> | The absolute path to render. |

src: src/render.ts:247  
dist: dist/render.js:179
<a name="prepareForJsdoc"></a>

## prepareForJsdoc(file, srcText, scratchDir) ⇒ <code>Promise&lt;PreparedFile&gt;</code>
Transpiles (.ts family) or copies (.js family) the source for jsdoc.

**Kind**: global function  
**Returns**: <code>Promise&lt;PreparedFile&gt;</code> - The prepared scratch file (or the transpile error).  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>SourceFile</code> | The source file being prepared. |
| srcText | <code>string</code> | The source text. |
| scratchDir | <code>string</code> | Per-file scratch directory to write into. |

src: src/render.ts:258  
dist: dist/render.js:189
<a name="resolveDistPointer"></a>

## resolveDistPointer(srcLine, transpileMapper, dist, issues) ⇒ <code>string</code>
Computes the dist pointer for one doclet. When the dist map exists but the
lookup misses, one "dist sourcemap missing or unmatched" note is recorded
(the no-map/no-dist cases already got their own single note).

**Kind**: global function  
**Returns**: <code>string</code> - The `dist:` pointer line.  

| Param | Type | Description |
| --- | --- | --- |
| srcLine | <code>number</code> | The source (original) line for the symbol. |
| transpileMapper | <code>SourceLineMapper</code> | Mapper from the transpile emit, or `null` for pass-through copies. |
| dist | <code>DistPointerContext</code> | Dist lookup context (kind, mapper, pointer path) computed once per file. |
| issues | <code>string[]</code> | Per-file notes accumulator. |

src: src/render.ts:324  
dist: dist/render.js:256
<a name="resolveSrcLine"></a>

## resolveSrcLine(generatedLine, transpileMapper) ⇒ <code>{ srcApprox: boolean; srcLine: number; }</code>
Maps a doclet's generated line back to the original source line.

**Kind**: global function  
**Returns**: <code>{ srcApprox: boolean; srcLine: number; }</code> - The source line and whether it is approximate.  

| Param | Type | Description |
| --- | --- | --- |
| generatedLine | <code>number</code> | The jsdoc-reported line in the generated file. |
| transpileMapper | <code>SourceLineMapper</code> | Mapper from the transpile emit, or `null` for pass-through copies. |

src: src/render.ts:343  
dist: dist/render.js:271
<a name="distJsPathFor"></a>

## distJsPathFor(file) ⇒ <code>string</code>
dist `.js` path for a source file: sibling rootDistDir, same relative path.

**Kind**: global function  
**Returns**: <code>string</code> - The absolute path of the expected dist `.js` file.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>SourceFile</code> | The source file whose dist counterpart is wanted. |

src: src/render.ts:384  
dist: dist/render.js:291
<a name="distMapperFor"></a>

## distMapperFor(distJs, srcAbsPath, issues) ⇒ <code>Promise&lt;DistMapperResult&gt;</code>
Reader mapper for the user's committed dist map, or `null` when missing or
referring to a different source (stale build, foreign map).

**Kind**: global function  
**Returns**: <code>Promise&lt;DistMapperResult&gt;</code> - The lookup result — a mapper, or `null` when the map is missing/stale.  

| Param | Type | Description |
| --- | --- | --- |
| distJs | <code>string</code> | Absolute path of the committed dist `.js` file. |
| srcAbsPath | <code>string</code> | Absolute path of the original source file the map must reference. |
| issues | <code>string[]</code> | Per-file notes accumulator. |

src: src/render.ts:398  
dist: dist/render.js:304
<a name="fail"></a>

## fail(file, outPath, message, issues) ⇒ <code>RenderFileResult</code>
Builds the failure result shape.

**Kind**: global function  
**Returns**: <code>RenderFileResult</code> - The failure result.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>SourceFile</code> | The source file that failed. |
| outPath | <code>string</code> | The planned output path. |
| message | <code>string</code> | Why the render failed. |
| issues | <code>string[]</code> | Notes collected before the failure. |

src: src/render.ts:423  
dist: dist/render.js:324
<a name="noteOnce"></a>

## noteOnce(issues, issue)
Adds an issue once per file.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| issues | <code>string[]</code> | The per-file notes accumulator (deduplicated in place). |
| issue | <code>string</code> | The note to add. |

src: src/render.ts:432  
dist: dist/render.js:332
<a name="withWarnSunk"></a>

## withWarnSunk(fn) ⇒ <code>Promise&lt;T&gt;</code>
Runs `fn` with `console.warn` silenced; the patch is never re-entered concurrently.

**Kind**: global function  
**Returns**: <code>Promise&lt;T&gt;</code> - The operation's result.  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>() &#x3D;&gt; Promise&lt;T&gt;</code> | The operation whose warnings are sunk. |

src: src/render.ts:447  
dist: dist/render.js:346
