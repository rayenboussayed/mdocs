## Functions

<dl>
<dt><a href="#doclet">doclet(lineno, kind, name)</a> ⇒ <code>{ kind: string; longname: string; meta: { filename: string; lineno: number; path: string; }; name: string; params: { description: string; name: string; }[]; }</code></dt>
<dd><p>Builds a minimal doclet for tests (defaults: function/thing).</p>
</dd>
<dt><a href="#setup">setup(dir, files)</a> ⇒ <code>Promise&lt;void&gt;</code></dt>
<dd><p>Writes <code>files</code> (name → content) under <code>&lt;dir&gt;/src</code>.</p>
</dd>
<dt><a href="#sourceFile">sourceFile(relPath, extension, dir)</a> ⇒ <code>SourceFile</code></dt>
<dd><p>Builds a SourceFile record for tests.</p>
</dd>
</dl>

<a name="doclet"></a>

## doclet(lineno, kind, name) ⇒ <code>{ kind: string; longname: string; meta: { filename: string; lineno: number; path: string; }; name: string; params: { description: string; name: string; }[]; }</code>
Builds a minimal doclet for tests (defaults: function/thing).

**Kind**: global function  
**Returns**: <code>{ kind: string; longname: string; meta: { filename: string; lineno: number; path: string; }; name: string; params: { description: string; name: string; }[]; }</code> - The doclet object.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| lineno | <code>number</code> |  | The jsdoc-reported line number of the doclet. |
| kind | <code>string</code> | <code>&quot;function&quot;</code> | The doclet kind. |
| name | <code>string</code> | <code>&quot;thing&quot;</code> | The doclet name. |

src: src/render.mocked.test.ts:36  
dist: dist/render.mocked.test.js:30 (approx.)
<a name="setup"></a>

## setup(dir, files) ⇒ <code>Promise&lt;void&gt;</code>
Writes `files` (name → content) under `<dir>/src`.

**Kind**: global function  
**Returns**: <code>Promise&lt;void&gt;</code> - Nothing.  

| Param | Type | Description |
| --- | --- | --- |
| dir | <code>string</code> | The fixture root to create. |
| files | <code>Record&lt;string, string&gt;</code> | The files to write. |

src: src/render.mocked.test.ts:52  
dist: dist/render.mocked.test.js:45 (approx.)
<a name="sourceFile"></a>

## sourceFile(relPath, extension, dir) ⇒ <code>SourceFile</code>
Builds a SourceFile record for tests.

**Kind**: global function  
**Returns**: <code>SourceFile</code> - The SourceFile record.  

| Param | Type | Description |
| --- | --- | --- |
| relPath | <code>string</code> | The posix-relative path of the source. |
| extension | <code>&quot;.js&quot; \| &quot;.jsx&quot; \| &quot;.mjs&quot; \| &quot;.cjs&quot; \| &quot;.ts&quot; \| &quot;.tsx&quot; \| &quot;.mts&quot; \| &quot;.cts&quot;</code> | The source extension. |
| dir | <code>string</code> | The absolute project directory. |

src: src/render.mocked.test.ts:66  
dist: dist/render.mocked.test.js:58 (approx.)
