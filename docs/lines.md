## Constants

<dl>
<dt><a href="#nullMapper">nullMapper</a></dt>
<dd><p>A mapper whose lookups always fail — used when the map is unusable.</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#createLineMapper">createLineMapper(mapJson, mapUrl, expectSource)</a> ⇒ <code>SourceLineMapper</code></dt>
<dd><p>Builds a line mapper from a sourcemap JSON string.</p>
</dd>
<dt><a href="#readFileSourceMap">readFileSourceMap(jsAbsPath)</a> ⇒ <code>Promise&lt;DistMapInfo&gt;</code></dt>
<dd><p>Reads the sourcemap for a generated <code>.js</code> file. The sibling <code>&lt;file&gt;.js.map</code>
is the cheap common case and is tried first; only if it is absent do we
touch the (potentially large) <code>.js</code> file to look for an inline map, and
then only its tail.</p>
</dd>
<dt><a href="#extractInlineMap">extractInlineMap(source)</a> ⇒ <code>string</code></dt>
<dd><p>Extracts and decodes a base64 inline sourcemap, if present.</p>
</dd>
<dt><a href="#normalizeSource">normalizeSource(source)</a> ⇒ <code>string</code></dt>
<dd><p>Normalizes a resolved source entry or an absolute path for comparison.
File URLs (what <code>resolve-uri</code> produces on Windows) are decoded to native
paths; separators are unified and trailing slashes trimmed. Comparison is
case-insensitive on Windows only.</p>
</dd>
<dt><a href="#tryFileURLToPath">tryFileURLToPath(source)</a> ⇒ <code>string</code></dt>
<dd><p>Converts a <code>file:</code> URL to a filesystem path.</p>
</dd>
</dl>

<a name="nullMapper"></a>

## nullMapper
A mapper whose lookups always fail — used when the map is unusable.

**Kind**: global constant  
src: src/lines.ts:202  
dist: dist/lines.js:191
<a name="createLineMapper"></a>

## createLineMapper(mapJson, mapUrl, expectSource) ⇒ <code>SourceLineMapper</code>
Builds a line mapper from a sourcemap JSON string.

**Kind**: global function  
**Returns**: <code>SourceLineMapper</code> - The line mapper.  

| Param | Type | Description |
| --- | --- | --- |
| mapJson | <code>string</code> | Raw `*.js.map` / inline sourcemap JSON. |
| mapUrl | <code>string</code> | Location of the map, used to resolve relative `sources`. |
| expectSource | <code>string</code> | Optional absolute path of the original source file.   When set, the map must reference it; otherwise the map is considered   stale or unrelated and every lookup returns `null` — the caller can   then fall back to an approximation instead of publishing misleading   line numbers. |

src: src/lines.ts:48  
dist: dist/lines.js:33
<a name="readFileSourceMap"></a>

## readFileSourceMap(jsAbsPath) ⇒ <code>Promise&lt;DistMapInfo&gt;</code>
Reads the sourcemap for a generated `.js` file. The sibling `<file>.js.map`
is the cheap common case and is tried first; only if it is absent do we
touch the (potentially large) `.js` file to look for an inline map, and
then only its tail.

**Kind**: global function  
**Returns**: <code>Promise&lt;DistMapInfo&gt;</code> - Which map is available (`map` / `no-map` / `no-dist`).  

| Param | Type | Description |
| --- | --- | --- |
| jsAbsPath | <code>string</code> | Absolute path of the generated `.js` file. |

src: src/lines.ts:107  
dist: dist/lines.js:92
<a name="extractInlineMap"></a>

## extractInlineMap(source) ⇒ <code>string</code>
Extracts and decodes a base64 inline sourcemap, if present.

**Kind**: global function  
**Returns**: <code>string</code> - The decoded map JSON, or `null` when no usable inline map exists.  

| Param | Type | Description |
| --- | --- | --- |
| source | <code>string</code> | The `.js` source text (only the tail is examined). |

src: src/lines.ts:155  
dist: dist/lines.js:142
<a name="normalizeSource"></a>

## normalizeSource(source) ⇒ <code>string</code>
Normalizes a resolved source entry or an absolute path for comparison.
File URLs (what `resolve-uri` produces on Windows) are decoded to native
paths; separators are unified and trailing slashes trimmed. Comparison is
case-insensitive on Windows only.

**Kind**: global function  
**Returns**: <code>string</code> - The normalized path (posix separators, no trailing slash).  

| Param | Type | Description |
| --- | --- | --- |
| source | <code>string</code> | The absolute path or file URL to normalize. |

src: src/lines.ts:176  
dist: dist/lines.js:165
<a name="tryFileURLToPath"></a>

## tryFileURLToPath(source) ⇒ <code>string</code>
Converts a `file:` URL to a filesystem path.

**Kind**: global function  
**Returns**: <code>string</code> - The decoded path, or `source` unchanged when it is not a file URL.  

| Param | Type | Description |
| --- | --- | --- |
| source | <code>string</code> | The string to convert. |

src: src/lines.ts:192  
dist: dist/lines.js:181
