## Functions

<dl>
<dt><a href="#execute">execute(roots, options)</a> ⇒ <code>Promise&lt;number&gt;</code></dt>
<dd><p>Runs the pipeline and prints the summary. Returns the exit code.</p>
</dd>
<dt><a href="#formatUnexpected">formatUnexpected(error)</a> ⇒ <code>string</code></dt>
<dd><p>Formats an unexpected error, honoring MDAICS_DEBUG for stack traces.</p>
</dd>
<dt><a href="#parseParallelism">parseParallelism(value)</a> ⇒ <code>number | boolean</code></dt>
<dd><p>Parses <code>--parallelism</code> into true | false | integer. Range checks live in the config schema.</p>
</dd>
<dt><a href="#printSummary">printSummary(result, verbose)</a></dt>
<dd><p>Prints the one-line summary and the failures, if any.</p>
</dd>
<dt><a href="#printVerbose">printVerbose(result)</a></dt>
<dd><p>Prints resolved settings and per-file details (--verbose).</p>
</dd>
</dl>

<a name="execute"></a>

## execute(roots, options) ⇒ <code>Promise&lt;number&gt;</code>
Runs the pipeline and prints the summary. Returns the exit code.

**Kind**: global function  
**Returns**: <code>Promise&lt;number&gt;</code> - The process exit code (`0` ok / dry-run, `1` on failure).  

| Param | Type | Description |
| --- | --- | --- |
| roots | <code>string[]</code> | Positional `rootSrcDir` arguments from the CLI. |
| options | <code>CliOptions</code> | Parsed CLI flags. |

src: src/cli.ts:71  
dist: dist/cli.js:49
<a name="formatUnexpected"></a>

## formatUnexpected(error) ⇒ <code>string</code>
Formats an unexpected error, honoring MDAICS_DEBUG for stack traces.

**Kind**: global function  
**Returns**: <code>string</code> - The message (plus stack trace when `MDAICS_DEBUG` is set).  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>unknown</code> | The unexpected error to format. |

src: src/cli.ts:110  
dist: dist/cli.js:93
<a name="parseParallelism"></a>

## parseParallelism(value) ⇒ <code>number \| boolean</code>
Parses `--parallelism` into true | false | integer. Range checks live in the config schema.

**Kind**: global function  
**Returns**: <code>number \| boolean</code> - `true`, `false`, or the parsed integer.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> | The raw flag value. |

src: src/cli.ts:121  
dist: dist/cli.js:105
<a name="printSummary"></a>

## printSummary(result, verbose)
Prints the one-line summary and the failures, if any.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>RunResult</code> | The run result to summarize. |
| verbose | <code>boolean</code> | When set, already printed in `printVerbose`; controls the dry-run listing. |

src: src/cli.ts:136  
dist: dist/cli.js:121
<a name="printVerbose"></a>

## printVerbose(result)
Prints resolved settings and per-file details (--verbose).

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>RunResult</code> | The run result to print. |

src: src/cli.ts:162  
dist: dist/cli.js:150
