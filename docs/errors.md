## Classes

<dl>
<dt><a href="#MdaicsError">MdaicsError</a></dt>
<dd><p>Shared error type for all expected <code>mdaics</code> failures.</p>
<p>Every failure an average user can plausibly fix (bad config, missing
directories, unreadable source files, …) is reported as a <code>MdaicsError</code>
with a stable machine-readable <code>code</code>. Unexpected
programming errors are left as plain <code>Error</code>s so they surface with a stack
trace instead of being masked by a friendly message.</p>
<p>Codes (all stable, all thrown by the pipeline in one place):</p>
<table>
<thead>
<tr>
<th>Code</th>
<th>Thrown by</th>
<th>Meaning</th>
</tr>
</thead>
<tbody><tr>
<td><code>INVALID_CONFIG</code></td>
<td><code>schema.ts</code> / <code>config.ts</code></td>
<td>Config fails zod validation (or a config exports a non-plain-object)</td>
</tr>
<tr>
<td><code>CONFIG_NOT_FOUND</code></td>
<td><code>config.ts</code></td>
<td>Explicit <code>--config</code> path does not exist / is unreadable</td>
</tr>
<tr>
<td><code>CONFIG_LOAD_FAILED</code></td>
<td><code>config.ts</code></td>
<td>Config module threw, rejected, or used unsupported syntax</td>
</tr>
<tr>
<td><code>NO_ROOTS</code></td>
<td><code>resolve.ts</code></td>
<td>A <code>rootSrcDir</code> glob matched no directories</td>
</tr>
<tr>
<td><code>INVALID_ROOT</code></td>
<td><code>resolve.ts</code></td>
<td>A resolved root is not a readable directory</td>
</tr>
<tr>
<td><code>OVERLAPPING_ROOTS</code></td>
<td><code>resolve.ts</code></td>
<td>One root is nested inside another</td>
</tr>
<tr>
<td><code>OUTPUT_COLLISION</code></td>
<td><code>resolve.ts</code></td>
<td>Two files would write the same <code>.md</code></td>
</tr>
<tr>
<td><code>RENDER_TIMEOUT</code></td>
<td><code>render.ts</code></td>
<td>jsdoc exceeded the per-file timeout</td>
</tr>
</tbody></table>
<p>Errors are stringified into <code>RunResult.failed[].error</code> / <code>RenderFileResult.error</code>
for per-file failures, and thrown for run-fatal ones (<code>INVALID_CONFIG</code>,
<code>CONFIG_*</code>, <code>NO_ROOTS</code>, <code>INVALID_ROOT</code>, <code>OVERLAPPING_ROOTS</code>, <code>OUTPUT_COLLISION</code>).</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#errorMessage">errorMessage(cause)</a> ⇒ <code>string</code></dt>
<dd><p>Stringifies an unknown caught value for diagnostics.</p>
</dd>
<dt><a href="#isMdaicsError">isMdaicsError(error)</a> ⇒ <code>boolean</code></dt>
<dd><p>Narrows <code>error</code> to <code>MdaicsError</code>.</p>
</dd>
</dl>

<a name="MdaicsError"></a>

## MdaicsError
Shared error type for all expected `mdaics` failures.

Every failure an average user can plausibly fix (bad config, missing
directories, unreadable source files, …) is reported as a `MdaicsError`
with a stable machine-readable `code`. Unexpected
programming errors are left as plain `Error`s so they surface with a stack
trace instead of being masked by a friendly message.

Codes (all stable, all thrown by the pipeline in one place):

| Code | Thrown by | Meaning |
| --- | --- | --- |
| `INVALID_CONFIG` | `schema.ts` / `config.ts` | Config fails zod validation (or a config exports a non-plain-object) |
| `CONFIG_NOT_FOUND` | `config.ts` | Explicit `--config` path does not exist / is unreadable |
| `CONFIG_LOAD_FAILED` | `config.ts` | Config module threw, rejected, or used unsupported syntax |
| `NO_ROOTS` | `resolve.ts` | A `rootSrcDir` glob matched no directories |
| `INVALID_ROOT` | `resolve.ts` | A resolved root is not a readable directory |
| `OVERLAPPING_ROOTS` | `resolve.ts` | One root is nested inside another |
| `OUTPUT_COLLISION` | `resolve.ts` | Two files would write the same `.md` |
| `RENDER_TIMEOUT` | `render.ts` | jsdoc exceeded the per-file timeout |

Errors are stringified into `RunResult.failed[].error` / `RenderFileResult.error`
for per-file failures, and thrown for run-fatal ones (`INVALID_CONFIG`,
`CONFIG_*`, `NO_ROOTS`, `INVALID_ROOT`, `OVERLAPPING_ROOTS`, `OUTPUT_COLLISION`).

**Kind**: global class  
src: src/errors.ts:27  
dist: dist/errors.js:27
<a name="MdaicsError+code"></a>

### mdaicsError.code
Stable machine-readable code, e.g. `CONFIG_NOT_FOUND`, `NO_ROOTS`, `INVALID_CONFIG`.

**Kind**: instance property of [<code>MdaicsError</code>](#MdaicsError)  
src: src/errors.ts:29  
dist: dist/errors.js:29
<a name="errorMessage"></a>

## errorMessage(cause) ⇒ <code>string</code>
Stringifies an unknown caught value for diagnostics.

**Kind**: global function  
**Returns**: <code>string</code> - The error message, or the stringified value for non-Errors.  

| Param | Type | Description |
| --- | --- | --- |
| cause | <code>unknown</code> | The caught value (Error, string, number, …). |

src: src/errors.ts:43  
dist: dist/errors.js:41
<a name="isMdaicsError"></a>

## isMdaicsError(error) ⇒ <code>boolean</code>
Narrows `error` to `MdaicsError`.

**Kind**: global function  
**Returns**: <code>boolean</code> - `true` when `error` is a `MdaicsError`.  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>unknown</code> | The value to narrow. |

src: src/errors.ts:52  
dist: dist/errors.js:49
