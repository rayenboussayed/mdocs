## Functions

<dl>
<dt><a href="#defineConfig">defineConfig(config)</a> ⇒ <code>MdaicsConfigExport</code></dt>
<dd><p>Identity helper for typed configs, mirroring vite&#39;s <code>defineConfig</code>:
<code>export default defineConfig({ … })</code>. Purely an authoring aid — validation
happens in <code>resolveConfig</code>, after the config is loaded.</p>
</dd>
<dt><a href="#loadConfig">loadConfig(cwd, explicitPath, overrides)</a> ⇒ <code>Promise&lt;{ config: ResolvedMdaicsConfig; filePath: string | undefined; }&gt;</code></dt>
<dd><p>Locates, loads, evaluates and validates the config file for <code>cwd</code>.</p>
<p>When no config file exists and no explicit path was given, the run falls
back to the default configuration (vite behavior) and <code>filePath</code> is
<code>undefined</code>. An explicit <code>--config</code> path that does not exist always
throws.</p>
<p><code>overrides</code> (config keys provided out-of-band, e.g. CLI flags or a
programmatic call) are merged over the file&#39;s config — an override always
wins for its own key, everything else comes from the file.</p>
</dd>
<dt><a href="#resolveConfig">resolveConfig(raw)</a> ⇒ <code>ResolvedMdaicsConfig</code></dt>
<dd><p>Resolves and validates a user-facing config into a <code>ResolvedMdaicsConfig</code>.</p>
</dd>
<dt><a href="#configLoadError">configLoadError(filePath, cause)</a> ⇒ <code>MdaicsError</code></dt>
<dd><p>Wraps config-loading failures with a consistent code and message.</p>
</dd>
<dt><a href="#definedOverrides">definedOverrides(overrides)</a> ⇒ <code>Record&lt;string, unknown&gt;</code></dt>
<dd><p>Keeps only the keys of <code>overrides</code> that are actually set.</p>
</dd>
<dt><a href="#describeType">describeType(value)</a> ⇒ <code>string</code></dt>
<dd><p>Human-readable description of a value&#39;s runtime type.</p>
</dd>
<dt><a href="#evaluateConfigExport">evaluateConfigExport(exported, filePath)</a> ⇒ <code>Promise&lt;unknown&gt;</code></dt>
<dd><p>Resolves the exported value, calling the function form if present.
Promise exports are resolved transparently: <code>await</code> assimilates thenables,
so by the time the value gets here any promise layers have already settled.</p>
</dd>
<dt><a href="#importConfigModule">importConfigModule(filePath)</a> ⇒ <code>Promise&lt;unknown&gt;</code></dt>
<dd><p>Imports a config module, choosing the loader the same way vite and Node do:</p>
<table>
<thead>
<tr>
<th>file</th>
<th>loader</th>
</tr>
</thead>
<tbody><tr>
<td><code>.mjs</code></td>
<td>ESM always</td>
</tr>
<tr>
<td><code>.cjs</code></td>
<td><code>require</code> (never silently reinterpreted)</td>
</tr>
<tr>
<td><code>.js</code> + <code>&quot;type&quot;: &quot;module&quot;</code></td>
<td>ESM always</td>
</tr>
<tr>
<td><code>.js</code> + <code>&quot;type&quot;: &quot;commonjs&quot;</code> or no <code>package.json</code></td>
<td><code>require</code> first,</td>
</tr>
<tr>
<td></td>
<td>falling back to a sibling <code>.mjs</code> copy only for ESM-in-CJS</td>
</tr>
</tbody></table>
<p><code>require()</code> of an ESM <code>.js</code> file fails with a plain <code>SyntaxError</code> on current
Node versions, so <code>.js</code> ESM configs in <code>&quot;type&quot;: &quot;commonjs&quot;</code> packages load
through the fallback, not through <code>require(esm)</code>.</p>
</dd>
<dt><a href="#importEsmInCommonJsPackage">importEsmInCommonJsPackage(filePath)</a> ⇒ <code>Promise&lt;unknown&gt;</code></dt>
<dd><p>Imports ESM config living in a <code>.js</code> file of a CommonJS-typed package.
The copy is written <strong>next to the config file</strong> — so relative imports in
the config keep working — with a hidden, unique name, removed afterwards.</p>
</dd>
<dt><a href="#isEsmInCjsError">isEsmInCjsError(error)</a> ⇒ <code>boolean</code></dt>
<dd><p>True when <code>error</code> reports ESM syntax loaded as CommonJS (Node-version-dependent).</p>
</dd>
<dt><a href="#isModuleNamespace">isModuleNamespace(value)</a> ⇒ <code>boolean</code></dt>
<dd><p>Detects a native ESM module namespace exotic object.</p>
</dd>
<dt><a href="#locateConfigFile">locateConfigFile(cwd, explicitPath)</a> ⇒ <code>Promise&lt;string&gt;</code></dt>
<dd><p>Finds the config file to use, honoring an explicit <code>--config</code> override.</p>
</dd>
<dt><a href="#nearestPackageType">nearestPackageType(filePath)</a> ⇒ <code>&quot;commonjs&quot; | &quot;module&quot;</code></dt>
<dd><p>Nearest <code>package.json</code> <code>&quot;type&quot;</code> walking up from <code>filePath</code> (or undefined).</p>
</dd>
<dt><a href="#resolveParallelism">resolveParallelism(value)</a> ⇒ <code>number</code></dt>
<dd><p>Resolves the effective worker count (&quot;true&quot; = all cores).</p>
</dd>
</dl>

<a name="defineConfig"></a>

## defineConfig(config) ⇒ <code>MdaicsConfigExport</code>
Identity helper for typed configs, mirroring vite's `defineConfig`:
`export default defineConfig({ … })`. Purely an authoring aid — validation
happens in `resolveConfig`, after the config is loaded.

**Kind**: global function  
**Returns**: <code>MdaicsConfigExport</code> - The config export, unchanged.  

| Param | Type | Description |
| --- | --- | --- |
| config | <code>MdaicsConfigExport</code> | The typed config object, function, or promise of either. |

src: src/config.ts:80  
dist: dist/config.js:38
<a name="loadConfig"></a>

## loadConfig(cwd, explicitPath, overrides) ⇒ <code>Promise&lt;{ config: ResolvedMdaicsConfig; filePath: string \| undefined; }&gt;</code>
Locates, loads, evaluates and validates the config file for `cwd`.

When no config file exists and no explicit path was given, the run falls
back to the default configuration (vite behavior) and `filePath` is
`undefined`. An explicit `--config` path that does not exist always
throws.

`overrides` (config keys provided out-of-band, e.g. CLI flags or a
programmatic call) are merged over the file's config — an override always
wins for its own key, everything else comes from the file.

**Kind**: global function  
**Returns**: <code>Promise&lt;{ config: ResolvedMdaicsConfig; filePath: string \| undefined; }&gt;</code> - The resolved config and the file (if any) it came from.  

| Param | Type | Description |
| --- | --- | --- |
| cwd | <code>string</code> | Working directory for config lookup and relative roots. |
| explicitPath | <code>string</code> | Explicit `--config` path (beats auto-discovery). |
| overrides | <code>{ cache?: boolean; cachePath?: string; outDirName?: string; parallelism?: number \| boolean; rootDistDir?: string; rootSrcDir?: string \| string[]; }</code> | Config keys merged over the file's config. |

src: src/config.ts:102  
dist: dist/config.js:58
<a name="resolveConfig"></a>

## resolveConfig(raw) ⇒ <code>ResolvedMdaicsConfig</code>
Resolves and validates a user-facing config into a `ResolvedMdaicsConfig`.

**Kind**: global function  
**Returns**: <code>ResolvedMdaicsConfig</code> - The frozen, fully-resolved config.  

| Param | Type | Description |
| --- | --- | --- |
| raw | <code>unknown</code> | The user-facing (unvalidated) config. |

src: src/config.ts:131  
dist: dist/config.js:85
<a name="configLoadError"></a>

## configLoadError(filePath, cause) ⇒ <code>MdaicsError</code>
Wraps config-loading failures with a consistent code and message.

**Kind**: global function  
**Returns**: <code>MdaicsError</code> - A `MdaicsError` with code `CONFIG_LOAD_FAILED`.  

| Param | Type | Description |
| --- | --- | --- |
| filePath | <code>string</code> | The config file that failed to load. |
| cause | <code>unknown</code> | The underlying error. |

src: src/config.ts:150  
dist: dist/config.js:103
<a name="definedOverrides"></a>

## definedOverrides(overrides) ⇒ <code>Record&lt;string, unknown&gt;</code>
Keeps only the keys of `overrides` that are actually set.

**Kind**: global function  
**Returns**: <code>Record&lt;string, unknown&gt;</code> - The overrides with only the set keys.  

| Param | Type | Description |
| --- | --- | --- |
| overrides | <code>{ cache?: boolean; cachePath?: string; outDirName?: string; parallelism?: number \| boolean; rootDistDir?: string; rootSrcDir?: string \| string[]; }</code> | The user-facing config overrides (any keys missing are kept unset). |

src: src/config.ts:160  
dist: dist/config.js:112
<a name="describeType"></a>

## describeType(value) ⇒ <code>string</code>
Human-readable description of a value's runtime type.

**Kind**: global function  
**Returns**: <code>string</code> - `null`, `an array`, or the `typeof` string.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>unknown</code> | The value to describe. |

src: src/config.ts:174  
dist: dist/config.js:126
<a name="evaluateConfigExport"></a>

## evaluateConfigExport(exported, filePath) ⇒ <code>Promise&lt;unknown&gt;</code>
Resolves the exported value, calling the function form if present.
Promise exports are resolved transparently: `await` assimilates thenables,
so by the time the value gets here any promise layers have already settled.

**Kind**: global function  
**Returns**: <code>Promise&lt;unknown&gt;</code> - The resolved plain-object config.  

| Param | Type | Description |
| --- | --- | --- |
| exported | <code>unknown</code> | The raw module export to resolve. |
| filePath | <code>string</code> | The config file it came from (for errors). |

src: src/config.ts:192  
dist: dist/config.js:144
<a name="importConfigModule"></a>

## importConfigModule(filePath) ⇒ <code>Promise&lt;unknown&gt;</code>
Imports a config module, choosing the loader the same way vite and Node do:

| file        | loader                                                    |
| ----------- | -------------------------------------------------------- |
| `.mjs`      | ESM always                                                |
| `.cjs`      | `require` (never silently reinterpreted)                  |
| `.js` + `"type": "module"`                       | ESM always        |
| `.js` + `"type": "commonjs"` or no `package.json` | `require` first,  |
|             | falling back to a sibling `.mjs` copy only for ESM-in-CJS |

`require()` of an ESM `.js` file fails with a plain `SyntaxError` on current
Node versions, so `.js` ESM configs in `"type": "commonjs"` packages load
through the fallback, not through `require(esm)`.

**Kind**: global function  
**Returns**: <code>Promise&lt;unknown&gt;</code> - The module export (namespace object for ESM, as-is for CJS).  

| Param | Type | Description |
| --- | --- | --- |
| filePath | <code>string</code> | The config file to import. |

src: src/config.ts:232  
dist: dist/config.js:180
<a name="importEsmInCommonJsPackage"></a>

## importEsmInCommonJsPackage(filePath) ⇒ <code>Promise&lt;unknown&gt;</code>
Imports ESM config living in a `.js` file of a CommonJS-typed package.
The copy is written **next to the config file** — so relative imports in
the config keep working — with a hidden, unique name, removed afterwards.

**Kind**: global function  
**Returns**: <code>Promise&lt;unknown&gt;</code> - The module export.  

| Param | Type | Description |
| --- | --- | --- |
| filePath | <code>string</code> | The `.js` config file whose ESM-in-CJS content is loaded. |

src: src/config.ts:266  
dist: dist/config.js:217
<a name="isEsmInCjsError"></a>

## isEsmInCjsError(error) ⇒ <code>boolean</code>
True when `error` reports ESM syntax loaded as CommonJS (Node-version-dependent).

**Kind**: global function  
**Returns**: <code>boolean</code> - Whether the error is an ESM-in-CJS load failure.  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>unknown</code> | The catch value to classify. |

src: src/config.ts:290  
dist: dist/config.js:238
<a name="isModuleNamespace"></a>

## isModuleNamespace(value) ⇒ <code>boolean</code>
Detects a native ESM module namespace exotic object.

**Kind**: global function  
**Returns**: <code>boolean</code> - `true` for a native ESM module namespace object.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>unknown</code> | The value to test. |

src: src/config.ts:305  
dist: dist/config.js:252
<a name="locateConfigFile"></a>

## locateConfigFile(cwd, explicitPath) ⇒ <code>Promise&lt;string&gt;</code>
Finds the config file to use, honoring an explicit `--config` override.

**Kind**: global function  
**Returns**: <code>Promise&lt;string&gt;</code> - The absolute path, or `undefined` when none exists and none was given.  

| Param | Type | Description |
| --- | --- | --- |
| cwd | <code>string</code> | Working directory to look up config files in. |
| explicitPath | <code>string</code> | Explicit `--config` path (never auto-discovered). |

src: src/config.ts:315  
dist: dist/config.js:261
<a name="nearestPackageType"></a>

## nearestPackageType(filePath) ⇒ <code>&quot;commonjs&quot; \| &quot;module&quot;</code>
Nearest `package.json` `"type"` walking up from `filePath` (or undefined).

**Kind**: global function  
**Returns**: <code>&quot;commonjs&quot; \| &quot;module&quot;</code> - `module`, `commonjs`, or `undefined` when no nearest `package.json` declares it.  

| Param | Type | Description |
| --- | --- | --- |
| filePath | <code>string</code> | The config file to start from. |

src: src/config.ts:344  
dist: dist/config.js:290
<a name="resolveParallelism"></a>

## resolveParallelism(value) ⇒ <code>number</code>
Resolves the effective worker count ("true" = all cores).

**Kind**: global function  
**Returns**: <code>number</code> - The concrete worker count.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>number \| boolean</code> | The user-facing `parallelism` (boolean or number). |

src: src/config.ts:366  
dist: dist/config.js:314
