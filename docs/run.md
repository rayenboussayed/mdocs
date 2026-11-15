## Functions

<dl>
<dt><a href="#run">run(options)</a> ⇒ <code>Promise&lt;RunResult&gt;</code></dt>
<dd><p>Executes the full pipeline. Resolves to a <code>RunResult</code>; throws only
for hard errors (config invalid, roots missing or overlapping).</p>
</dd>
<dt><a href="#tryOutputPath">tryOutputPath(file)</a> ⇒ <code>string</code></dt>
<dd><p>Best-effort <code>outputPathFor</code> for the unreachable-error path.</p>
</dd>
<dt><a href="#writeMarkdown">writeMarkdown(target)</a> ⇒ <code>Promise&lt;void&gt;</code></dt>
<dd><p>Writes one rendered markdown file.</p>
</dd>
</dl>

<a name="run"></a>

## run(options) ⇒ <code>Promise&lt;RunResult&gt;</code>
Executes the full pipeline. Resolves to a `RunResult`; throws only
for hard errors (config invalid, roots missing or overlapping).

**Kind**: global function  
**Returns**: <code>Promise&lt;RunResult&gt;</code> - The run result — written/skipped/failed files, notes, timings.  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>RunOptions</code> | Run options (cwd, config path, dry-run, inline config keys). |

src: src/run.ts:67  
dist: dist/run.js:27
<a name="tryOutputPath"></a>

## tryOutputPath(file) ⇒ <code>string</code>
Best-effort `outputPathFor` for the unreachable-error path.

**Kind**: global function  
**Returns**: <code>string</code> - The planned output path, or `<unresolved>` when it cannot be computed.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>SourceFile</code> | The source file whose planned output path is wanted. |

src: src/run.ts:181  
dist: dist/run.js:132
<a name="writeMarkdown"></a>

## writeMarkdown(target) ⇒ <code>Promise&lt;void&gt;</code>
Writes one rendered markdown file.

**Kind**: global function  
**Returns**: <code>Promise&lt;void&gt;</code> - Nothing.  

| Param | Type | Description |
| --- | --- | --- |
| target | <code>{ markdown: string; outPath: string; }</code> | The file to write. |
| target.outPath |  | Absolute destination of the markdown. |
| target.markdown |  | The markdown content. |

src: src/run.ts:198  
dist: dist/run.js:149
