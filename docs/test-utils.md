## Functions

<dl>
<dt><a href="#expectMdaicsError">expectMdaicsError(fn)</a> ⇒ <code>Promise&lt;MdaicsError&gt;</code></dt>
<dd><p>Asserts that <code>fn</code> throws an <code>MdaicsError</code>, returning it for further
assertions. Re-throws the original error untouched when it is not an
<code>MdaicsError</code>, so unexpected failure modes stay loud.</p>
</dd>
<dt><a href="#mkdirp">mkdirp(path)</a> ⇒ <code>Promise&lt;void&gt;</code></dt>
<dd><p><code>mkdir</code> with <code>recursive: true</code> always (tests only create fixture trees) —
delegated to jutilities&#39; <code>ensureDirectory</code>.</p>
</dd>
<dt><a href="#readUtf8">readUtf8(path)</a> ⇒ <code>Promise&lt;string&gt;</code></dt>
<dd><p><code>readFile</code> pinned to utf8.</p>
</dd>
<dt><a href="#writeUtf8">writeUtf8(path, data)</a> ⇒ <code>Promise&lt;void&gt;</code></dt>
<dd><p><code>writeFile</code> pinned to utf8 — tests only ever write source text.</p>
</dd>
</dl>

<a name="expectMdaicsError"></a>

## expectMdaicsError(fn) ⇒ <code>Promise&lt;MdaicsError&gt;</code>
Asserts that `fn` throws an `MdaicsError`, returning it for further
assertions. Re-throws the original error untouched when it is not an
`MdaicsError`, so unexpected failure modes stay loud.

**Kind**: global function  
**Returns**: <code>Promise&lt;MdaicsError&gt;</code> - The `MdaicsError` it threw.  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>() &#x3D;&gt; unknown</code> | The function expected to throw an `MdaicsError`. |

src: src/test-utils.ts:17  
<a name="mkdirp"></a>

## mkdirp(path) ⇒ <code>Promise&lt;void&gt;</code>
`mkdir` with `recursive: true` always (tests only create fixture trees) —
delegated to jutilities' `ensureDirectory`.

**Kind**: global function  
**Returns**: <code>Promise&lt;void&gt;</code> - Nothing.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The directory to create. |

src: src/test-utils.ts:33  
<a name="readUtf8"></a>

## readUtf8(path) ⇒ <code>Promise&lt;string&gt;</code>
`readFile` pinned to utf8.

**Kind**: global function  
**Returns**: <code>Promise&lt;string&gt;</code> - The file contents as a utf8 string.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The file to read. |

src: src/test-utils.ts:42  
<a name="writeUtf8"></a>

## writeUtf8(path, data) ⇒ <code>Promise&lt;void&gt;</code>
`writeFile` pinned to utf8 — tests only ever write source text.

**Kind**: global function  
**Returns**: <code>Promise&lt;void&gt;</code> - Nothing.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The file to write. |
| data | <code>string</code> | The utf8 content to write. |

src: src/test-utils.ts:53  
