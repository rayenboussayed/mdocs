## Members

<dl>
<dt><a href="#doclets">doclets</a></dt>
<dd><p>Raw <code>jsdoc2md.getTemplateData()</code> output (tdata entries only).</p>
</dd>
<dt><a href="#fp">fp</a></dt>
<dd><p>Content fingerprint the entry was computed from.</p>
</dd>
<dt><a href="#issues">issues</a></dt>
<dd><p>Notes the fresh render produced (replayed on tier-1 hits). Always stored — possibly empty.</p>
</dd>
<dt><a href="#lastUsed">lastUsed</a></dt>
<dd><p>Milliseconds since epoch of the last hit/store — drives LRU eviction.</p>
</dd>
<dt><a href="#markdown">markdown</a></dt>
<dd><p>The finished markdown (md entries, non-skipped).</p>
</dd>
<dt><a href="#skipped">skipped</a></dt>
<dd><p>The source file was intentionally not rendered (no JSDoc).</p>
</dd>
<dt><a href="#version">version</a></dt>
<dd><p>Cache format version — bump on incompatible changes.</p>
</dd>
</dl>

## Constants

<dl>
<dt><a href="#ABSOLUTE_PATH">ABSOLUTE_PATH</a></dt>
<dd><p>Matches POSIX absolute paths, Windows drive paths and UNC paths.</p>
</dd>
<dt><a href="#DEFAULT_CONFIG">DEFAULT_CONFIG</a></dt>
<dd><p>Default values for every configuration key. Single source for the schema
<code>.default()</code> arguments and the public <code>DEFAULT_CONFIG</code> export.</p>
</dd>
<dt><a href="#relativeDirName">relativeDirName</a></dt>
<dd><p>Relative directory name allowed for <code>rootDistDir</code> / <code>outDirName</code> / <code>cachePath</code>.</p>
</dd>
<dt><a href="#rootSrcDirEntry">rootSrcDirEntry</a></dt>
<dd><p>One src dir: a path or glob pattern (unexpanded here — resolved later).</p>
</dd>
<dt><a href="#mdocsConfigSchema">mdocsConfigSchema</a></dt>
<dd><p>Validates <code>mdocs.config.*</code> content. Unknown keys are rejected (an
unrecognized key is nearly always a typo&#39;d option).</p>
</dd>
<dt><a href="#cacheEntryKind">cacheEntryKind</a></dt>
<dd><p>Kind discriminator of one cache entry.</p>
</dd>
<dt><a href="#cacheKeySchema">cacheKeySchema</a></dt>
<dd><p>Cache keys are <code>&lt;kind&gt;:&lt;cwd-relative posix path&gt;</code>, e.g. <code>md:src/cli.ts</code>.</p>
</dd>
<dt><a href="#cacheEntrySchema">cacheEntrySchema</a></dt>
<dd><p>One cache entry — either a finished render or raw jsdoc template data.</p>
</dd>
<dt><a href="#cacheFileSchema">cacheFileSchema</a></dt>
<dd><p>One on-disk render cache (see <code>cache.js</code>).</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#dirSegments">dirSegments(value)</a> ⇒ <code>string[]</code></dt>
<dd><p>Splits a candidate relative dir name into its meaningful segments.</p>
</dd>
<dt><a href="#parseMdocsConfig">parseMdocsConfig(input)</a> ⇒ <code>{ cache: boolean; cachePath: string; outDirName: string; parallelism: number | boolean; rootDistDir: string; rootSrcDir: string | string[]; }</code></dt>
<dd><p>Parses <code>input</code> (config file content) into a validated object, throwing
<code>MdocsError</code> with a message that names every offending key.</p>
</dd>
<dt><a href="#envFlag">envFlag(value)</a> ⇒ <code>boolean</code></dt>
<dd><p>Truthy interpretation for flag-style environment variables.</p>
</dd>
<dt><a href="#formatIssues">formatIssues(error)</a> ⇒ <code>string</code></dt>
<dd><p>Flattens a ZodError into one <code>key: message</code> sentence per issue.</p>
</dd>
<dt><a href="#parseProcessEnv">parseProcessEnv(env)</a> ⇒ <code>ProcessEnv</code></dt>
<dd><p>Validates the environment variables mdocs consumes. Never throws: unknown
variables are ignored and invalid values fall back to safe defaults.</p>
</dd>
<dt><a href="#parseCacheFile">parseCacheFile(input)</a> ⇒ <code>{ entries: Record&lt;string, { fp: string; issues: string[]; kind: &quot;md&quot; | &quot;tdata&quot;; lastUsed: number; symbols: number; doclets?: Record&lt;string, unknown&gt;[]; markdown?: string; skipped?: &quot;no-jsdoc&quot;; }&gt;; version: 1; }</code></dt>
<dd><p>Parses the on-disk cache. Never throws: a corrupt or outdated cache is a
cache miss, not a failure — the run simply re-renders.</p>
</dd>
</dl>

<a name="doclets"></a>

## doclets
Raw `jsdoc2md.getTemplateData()` output (tdata entries only).

**Kind**: global variable  
src: src/schema.ts:179  
dist: dist/schema.js:143
<a name="fp"></a>

## fp
Content fingerprint the entry was computed from.

**Kind**: global variable  
src: src/schema.ts:181  
dist: dist/schema.js:145
<a name="issues"></a>

## issues
Notes the fresh render produced (replayed on tier-1 hits). Always stored — possibly empty.

**Kind**: global variable  
src: src/schema.ts:183  
dist: dist/schema.js:147
<a name="lastUsed"></a>

## lastUsed
Milliseconds since epoch of the last hit/store — drives LRU eviction.

**Kind**: global variable  
src: src/schema.ts:186  
dist: dist/schema.js:150
<a name="markdown"></a>

## markdown
The finished markdown (md entries, non-skipped).

**Kind**: global variable  
src: src/schema.ts:188  
dist: dist/schema.js:152
<a name="skipped"></a>

## skipped
The source file was intentionally not rendered (no JSDoc).

**Kind**: global variable  
src: src/schema.ts:190  
dist: dist/schema.js:154
<a name="version"></a>

## version
Cache format version — bump on incompatible changes.

**Kind**: global variable  
src: src/schema.ts:212  
dist: dist/schema.js:175
<a name="ABSOLUTE_PATH"></a>

## ABSOLUTE\_PATH
Matches POSIX absolute paths, Windows drive paths and UNC paths.

**Kind**: global constant  
src: src/schema.ts:24  
dist: dist/schema.js:21
<a name="DEFAULT_CONFIG"></a>

## DEFAULT\_CONFIG
Default values for every configuration key. Single source for the schema
`.default()` arguments and the public `DEFAULT_CONFIG` export.

**Kind**: global constant  
src: src/schema.ts:43  
dist: dist/schema.js:38
<a name="relativeDirName"></a>

## relativeDirName
Relative directory name allowed for `rootDistDir` / `outDirName` / `cachePath`.

**Kind**: global constant  
src: src/schema.ts:53  
dist: dist/schema.js:47
<a name="rootSrcDirEntry"></a>

## rootSrcDirEntry
One src dir: a path or glob pattern (unexpanded here — resolved later).

**Kind**: global constant  
src: src/schema.ts:66  
dist: dist/schema.js:56
<a name="mdocsConfigSchema"></a>

## mdocsConfigSchema
Validates `mdocs.config.*` content. Unknown keys are rejected (an
unrecognized key is nearly always a typo'd option).

**Kind**: global constant  
src: src/schema.ts:72  
dist: dist/schema.js:61
<a name="cacheEntryKind"></a>

## cacheEntryKind
Kind discriminator of one cache entry.

**Kind**: global constant  
src: src/schema.ts:170  
dist: dist/schema.js:136
<a name="cacheKeySchema"></a>

## cacheKeySchema
Cache keys are `<kind>:<cwd-relative posix path>`, e.g. `md:src/cli.ts`.

**Kind**: global constant  
src: src/schema.ts:173  
dist: dist/schema.js:138
<a name="cacheEntrySchema"></a>

## cacheEntrySchema
One cache entry — either a finished render or raw jsdoc template data.

**Kind**: global constant  
src: src/schema.ts:176  
dist: dist/schema.js:140
<a name="cacheFileSchema"></a>

## cacheFileSchema
One on-disk render cache (see `cache.js`).

**Kind**: global constant  
src: src/schema.ts:209  
dist: dist/schema.js:172
<a name="dirSegments"></a>

## dirSegments(value) ⇒ <code>string[]</code>
Splits a candidate relative dir name into its meaningful segments.

**Kind**: global function  
**Returns**: <code>string[]</code> - The non-trivial path segments (never `.`, never empty).  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> | The candidate relative directory name. |

src: src/schema.ts:35  
dist: dist/schema.js:31
<a name="parseMdocsConfig"></a>

## parseMdocsConfig(input) ⇒ <code>{ cache: boolean; cachePath: string; outDirName: string; parallelism: number \| boolean; rootDistDir: string; rootSrcDir: string \| string[]; }</code>
Parses `input` (config file content) into a validated object, throwing
`MdocsError` with a message that names every offending key.

**Kind**: global function  
**Returns**: <code>{ cache: boolean; cachePath: string; outDirName: string; parallelism: number \| boolean; rootDistDir: string; rootSrcDir: string \| string[]; }</code> - The validated config (all keys present; defaults applied).  

| Param | Type | Description |
| --- | --- | --- |
| input | <code>unknown</code> | The unvalidated config input. |

src: src/schema.ts:98  
dist: dist/schema.js:80
<a name="envFlag"></a>

## envFlag(value) ⇒ <code>boolean</code>
Truthy interpretation for flag-style environment variables.

**Kind**: global function  
**Returns**: <code>boolean</code> - `true` for `1|true|yes|on` (case-insensitive), else `false`.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> | The raw env var value. |

src: src/schema.ts:109  
dist: dist/schema.js:91
<a name="formatIssues"></a>

## formatIssues(error) ⇒ <code>string</code>
Flattens a ZodError into one `key: message` sentence per issue.

**Kind**: global function  
**Returns**: <code>string</code> - A single-line, human-readable issue summary.  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>z.ZodError&lt;unknown&gt;</code> | The ZodError whose issues are formatted. |

src: src/schema.ts:122  
dist: dist/schema.js:102
<a name="parseProcessEnv"></a>

## parseProcessEnv(env) ⇒ <code>ProcessEnv</code>
Validates the environment variables mdocs consumes. Never throws: unknown
variables are ignored and invalid values fall back to safe defaults.

**Kind**: global function  
**Returns**: <code>ProcessEnv</code> - The parsed `NODE_ENV` value.  

| Param | Type | Description |
| --- | --- | --- |
| env | <code>NodeJS.ProcessEnv</code> | The raw environment (missing keys fall back to defaults). |

src: src/schema.ts:154  
dist: dist/schema.js:122
<a name="parseCacheFile"></a>

## parseCacheFile(input) ⇒ <code>{ entries: Record&lt;string, { fp: string; issues: string[]; kind: &quot;md&quot; \| &quot;tdata&quot;; lastUsed: number; symbols: number; doclets?: Record&lt;string, unknown&gt;[]; markdown?: string; skipped?: &quot;no-jsdoc&quot;; }&gt;; version: 1; }</code>
Parses the on-disk cache. Never throws: a corrupt or outdated cache is a
cache miss, not a failure — the run simply re-renders.

**Kind**: global function  
**Returns**: <code>{ entries: Record&lt;string, { fp: string; issues: string[]; kind: &quot;md&quot; \| &quot;tdata&quot;; lastUsed: number; symbols: number; doclets?: Record&lt;string, unknown&gt;[]; markdown?: string; skipped?: &quot;no-jsdoc&quot;; }&gt;; version: 1; }</code> - The validated cache, or `null` when missing/corrupt/unsupported.  

| Param | Type | Description |
| --- | --- | --- |
| input | <code>unknown</code> | The parsed JSON (unknown). |

src: src/schema.ts:222  
dist: dist/schema.js:183
