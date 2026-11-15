## Constants

<dl>
<dt><a href="#ABSOLUTE_PATH">ABSOLUTE_PATH</a></dt>
<dd><p>Matches POSIX absolute paths, Windows drive paths and UNC paths.</p>
</dd>
<dt><a href="#relativeDirName">relativeDirName</a></dt>
<dd><p>Relative directory name allowed for <code>rootDistDir</code> / <code>outDirName</code>.</p>
</dd>
<dt><a href="#rootSrcDirEntry">rootSrcDirEntry</a></dt>
<dd><p>One src dir: a path or glob pattern (unexpanded here — resolved later).</p>
</dd>
<dt><a href="#mdocsConfigSchema">mdocsConfigSchema</a></dt>
<dd><p>Validates <code>mdocs.config.*</code> content. Unknown keys are rejected (an
unrecognized key is nearly always a typo&#39;d option).</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#dirSegments">dirSegments(value)</a> ⇒ <code>string[]</code></dt>
<dd><p>Splits a candidate relative dir name into its meaningful segments.</p>
</dd>
<dt><a href="#parseMdocsConfig">parseMdocsConfig(input)</a> ⇒ <code>{ outDirName?: string; parallelism?: number | boolean; rootDistDir?: string; rootSrcDir?: string | string[]; }</code></dt>
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
</dl>

<a name="ABSOLUTE_PATH"></a>

## ABSOLUTE\_PATH
Matches POSIX absolute paths, Windows drive paths and UNC paths.

**Kind**: global constant  
src: src/schema.ts:25  
dist: dist/schema.js:22
<a name="relativeDirName"></a>

## relativeDirName
Relative directory name allowed for `rootDistDir` / `outDirName`.

**Kind**: global constant  
src: src/schema.ts:41  
dist: dist/schema.js:36
<a name="rootSrcDirEntry"></a>

## rootSrcDirEntry
One src dir: a path or glob pattern (unexpanded here — resolved later).

**Kind**: global constant  
src: src/schema.ts:54  
dist: dist/schema.js:45
<a name="mdocsConfigSchema"></a>

## mdocsConfigSchema
Validates `mdocs.config.*` content. Unknown keys are rejected (an
unrecognized key is nearly always a typo'd option).

**Kind**: global constant  
src: src/schema.ts:60  
dist: dist/schema.js:50
<a name="dirSegments"></a>

## dirSegments(value) ⇒ <code>string[]</code>
Splits a candidate relative dir name into its meaningful segments.

**Kind**: global function  
**Returns**: <code>string[]</code> - The non-trivial path segments (never `.`, never empty).  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> | The candidate relative directory name. |

src: src/schema.ts:36  
dist: dist/schema.js:32
<a name="parseMdocsConfig"></a>

## parseMdocsConfig(input) ⇒ <code>{ outDirName?: string; parallelism?: number \| boolean; rootDistDir?: string; rootSrcDir?: string \| string[]; }</code>
Parses `input` (config file content) into a validated object, throwing
`MdocsError` with a message that names every offending key.

**Kind**: global function  
**Returns**: <code>{ outDirName?: string; parallelism?: number \| boolean; rootDistDir?: string; rootSrcDir?: string \| string[]; }</code> - The validated config (all keys optional).  

| Param | Type | Description |
| --- | --- | --- |
| input | <code>unknown</code> | The unvalidated config input. |

src: src/schema.ts:83  
dist: dist/schema.js:67
<a name="envFlag"></a>

## envFlag(value) ⇒ <code>boolean</code>
Truthy interpretation for flag-style environment variables.

**Kind**: global function  
**Returns**: <code>boolean</code> - `true` for `1|true|yes|on` (case-insensitive), else `false`.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> | The raw env var value. |

src: src/schema.ts:94  
dist: dist/schema.js:78
<a name="formatIssues"></a>

## formatIssues(error) ⇒ <code>string</code>
Flattens a ZodError into one `key: message` sentence per issue.

**Kind**: global function  
**Returns**: <code>string</code> - A single-line, human-readable issue summary.  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>z.ZodError&lt;unknown&gt;</code> | The ZodError whose issues are formatted. |

src: src/schema.ts:107  
dist: dist/schema.js:89
<a name="parseProcessEnv"></a>

## parseProcessEnv(env) ⇒ <code>ProcessEnv</code>
Validates the environment variables mdocs consumes. Never throws: unknown
variables are ignored and invalid values fall back to safe defaults.

**Kind**: global function  
**Returns**: <code>ProcessEnv</code> - The parsed `NODE_ENV` value.  

| Param | Type | Description |
| --- | --- | --- |
| env | <code>NodeJS.ProcessEnv</code> | The raw environment (missing keys fall back to defaults). |

src: src/schema.ts:139  
dist: dist/schema.js:109
