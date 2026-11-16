## Functions

<dl>
<dt><a href="#run">run(options)</a> ⇒ <code>Promise&lt;RunResult&gt;</code></dt>
<dd><p>Executes the full pipeline. Resolves to a <code>RunResult</code>; throws only
for hard errors (config invalid, roots missing or overlapping).</p>
</dd>
<dt><a href="#cachedResult">cachedResult(entry, file, outPath)</a> ⇒ <code>RenderFileResult</code></dt>
<dd><p>Rebuilds a render result from a tier-1 cache entry.</p>
</dd>
<dt><a href="#storeCachedResult">storeCachedResult(cache, fp, result)</a></dt>
<dd><p>Stores one successful render in the tier-1 cache (skips failures).</p>
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

src: src/run.ts:85  
dist: dist/run.js:29
<a name="cachedResult"></a>

## cachedResult(entry, file, outPath) ⇒ <code>RenderFileResult</code>
Rebuilds a render result from a tier-1 cache entry.

**Kind**: global function  
**Returns**: <code>RenderFileResult</code> - The render outcome (identical in shape to a fresh render).  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>{ fp: string; issues: string[]; kind: &quot;md&quot; \| &quot;tdata&quot;; lastUsed: number; symbols: number; doclets?: Record&lt;string, unknown&gt;[]; markdown?: string; skipped?: &quot;no-jsdoc&quot;; }</code> | The cached entry (fp already matched by the caller). |
| file | <code>SourceFile</code> | The source file the entry belongs to. |
| outPath | <code>string</code> | The planned output path. |

src: src/run.ts:275  
dist: dist/run.js:206
<a name="storeCachedResult"></a>

## storeCachedResult(cache, fp, result)
Stores one successful render in the tier-1 cache (skips failures).

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| cache | <code>Cache</code> | The loaded cache, or absent when caching is disabled. |
| fp | <code>FileFingerprints</code> | The file's fingerprints. |
| result | <code>RenderFileResult</code> | The render outcome. |

src: src/run.ts:288  
dist: dist/run.js:218
<a name="tryOutputPath"></a>

## tryOutputPath(file) ⇒ <code>string</code>
Best-effort `outputPathFor` for the unreachable-error path.

**Kind**: global function  
**Returns**: <code>string</code> - The planned output path, or `<unresolved>` when it cannot be computed.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>SourceFile</code> | The source file whose planned output path is wanted. |

src: src/run.ts:306  
dist: dist/run.js:237
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

src: src/run.ts:322  
dist: dist/run.js:253
