## Constants

<dl>
<dt><a href="#MAX_MARKDOWN_BYTES">MAX_MARKDOWN_BYTES</a></dt>
<dd><p>Keep in sync with the zod caps in <code>schema.js</code>.</p>
</dd>
<dt><a href="#MAX_DOCLETS">MAX_DOCLETS</a></dt>
<dd><p>Keep in sync with the zod cap in <code>schema.js</code>.</p>
</dd>
<dt><a href="#CACHE_FORMAT">CACHE_FORMAT</a></dt>
<dd><p>Cache format version — bump on incompatible entry changes.</p>
</dd>
<dt><a href="#CACHE_CAP">CACHE_CAP</a></dt>
<dd><p>Maximum entries kept; least-recently-used are evicted first.</p>
</dd>
<dt><a href="#RENDER_FORMAT">RENDER_FORMAT</a></dt>
<dd><p>Distinguishes cache behavior across renderer/output-format changes.</p>
</dd>
<dt><a href="#DTS_SWEEP_CAP">DTS_SWEEP_CAP</a></dt>
<dd><p>Cap on .d.ts declaration files swept into the program fingerprint.</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#createCache">createCache(options)</a> ⇒ <code>Promise&lt;Cache&gt;</code></dt>
<dd><p>Loads a cache from disk (never throws), returning a ready-to-use handle.</p>
</dd>
<dt><a href="#distMaterialOf">distMaterialOf(distJs)</a> ⇒ <code>Promise&lt;string&gt;</code></dt>
<dd><p>The dist-side fingerprint material for one file — hashes the dist map when
present, else a sentinel for its absence.</p>
</dd>
<dt><a href="#fileFingerprints">fileFingerprints(args)</a> ⇒ <code>FileFingerprints</code></dt>
<dd><p>The per-file fingerprints and tier keys for one source file.</p>
</dd>
<dt><a href="#lockfileFingerprint">lockfileFingerprint(cwd)</a> ⇒ <code>Promise&lt;string&gt;</code></dt>
<dd><p>The sha256 of the lockfile in <code>cwd</code>, or <code>undefined</code> when absent/unreadable.</p>
</dd>
<dt><a href="#programFingerprint">programFingerprint(args)</a> ⇒ <code>Promise&lt;string&gt;</code></dt>
<dd><p>The whole-program fingerprint for .ts files — every source and declaration
file under the project roots, plus the lockfile and the TypeScript version.
Covers first-party <code>.d.ts</code> files that are imported but never roots.
Node_modules trees behind a lockfile are pinned by the lockfile hash; trees
drifted from their lockfile (postinstall patches) can serve stale types.</p>
</dd>
<dt><a href="#sweepDeclarations">sweepDeclarations(srcDirs, cap)</a> ⇒ <code>Promise&lt;string[]&gt;</code></dt>
<dd><p>Finds every <code>.d.ts</code> under the project roots (capped at <a href="#DTS_SWEEP_CAP">DTS_SWEEP_CAP</a>).</p>
</dd>
<dt><a href="#toolchainFingerprint">toolchainFingerprint()</a> ⇒ <code>string</code></dt>
<dd><p>Computes the cache fingerprint of the toolchain — everything about the
installed mdocs + jsdoc + TypeScript that can shape the rendered output.</p>
</dd>
<dt><a href="#evict">evict(entries, overflow)</a></dt>
<dd><p>Drops the least-valuable entries until only <code>cap</code> remain.</p>
</dd>
<dt><a href="#evictionClass">evictionClass(entry)</a> ⇒ <code>number</code></dt>
<dd><p>Eviction class: no-jsdoc skips first, then tdata, then full markdown.</p>
</dd>
<dt><a href="#hashFile">hashFile(path)</a> ⇒ <code>Promise&lt;string&gt;</code></dt>
<dd><p>Sha256 hex of a file&#39;s contents, or <code>UNREADABLE</code> when it cannot be read.</p>
</dd>
<dt><a href="#packageVersionOf">packageVersionOf(name)</a> ⇒ <code>string</code></dt>
<dd><p>Version of an installed package, walking up from its entry point; <code>?</code> on failure.</p>
</dd>
<dt><a href="#readManifest">readManifest(manifestPath, name)</a> ⇒ <code>string</code></dt>
<dd><p>Reads one <code>package.json</code>, returning its version when it names <code>name</code>.</p>
</dd>
<dt><a href="#sha256">sha256(text)</a> ⇒ <code>string</code></dt>
<dd><p>Sha256 hex digest of <code>text</code>.</p>
</dd>
</dl>

<a name="MAX_MARKDOWN_BYTES"></a>

## MAX\_MARKDOWN\_BYTES
Keep in sync with the zod caps in `schema.js`.

**Kind**: global constant  
src: src/cache.ts:49  
dist: dist/cache.js:45
<a name="MAX_DOCLETS"></a>

## MAX\_DOCLETS
Keep in sync with the zod cap in `schema.js`.

**Kind**: global constant  
src: src/cache.ts:51  
dist: dist/cache.js:47
<a name="CACHE_FORMAT"></a>

## CACHE\_FORMAT
Cache format version — bump on incompatible entry changes.

**Kind**: global constant  
src: src/cache.ts:54  
dist: dist/cache.js:49
<a name="CACHE_CAP"></a>

## CACHE\_CAP
Maximum entries kept; least-recently-used are evicted first.

**Kind**: global constant  
src: src/cache.ts:56  
dist: dist/cache.js:51
<a name="RENDER_FORMAT"></a>

## RENDER\_FORMAT
Distinguishes cache behavior across renderer/output-format changes.

**Kind**: global constant  
src: src/cache.ts:58  
dist: dist/cache.js:53
<a name="DTS_SWEEP_CAP"></a>

## DTS\_SWEEP\_CAP
Cap on .d.ts declaration files swept into the program fingerprint.

**Kind**: global constant  
src: src/cache.ts:60  
dist: dist/cache.js:55
<a name="createCache"></a>

## createCache(options) ⇒ <code>Promise&lt;Cache&gt;</code>
Loads a cache from disk (never throws), returning a ready-to-use handle.

**Kind**: global function  
**Returns**: <code>Promise&lt;Cache&gt;</code> - The cache (issues carry any problems found at load time).  

| Param | Description |
| --- | --- |
| options | The cache location. |
| options.path | Absolute path of the cache file. |
| options.cap | Maximum entries (default [CACHE_CAP](#CACHE_CAP)). |
| options.now | Clock override for tests (default [Date.now](Date.now)). |

src: src/cache.ts:107  
dist: dist/cache.js:64
<a name="distMaterialOf"></a>

## distMaterialOf(distJs) ⇒ <code>Promise&lt;string&gt;</code>
The dist-side fingerprint material for one file — hashes the dist map when
present, else a sentinel for its absence.

**Kind**: global function  
**Returns**: <code>Promise&lt;string&gt;</code> - `map:<sha256(mapJson)>` / `no-map` / `no-dist`.  

| Param | Type | Description |
| --- | --- | --- |
| distJs | <code>string</code> | Absolute path of the expected dist `.js` file. |

src: src/cache.ts:168  
dist: dist/cache.js:133
<a name="fileFingerprints"></a>

## fileFingerprints(args) ⇒ <code>FileFingerprints</code>
The per-file fingerprints and tier keys for one source file.

**Kind**: global function  
**Returns**: <code>FileFingerprints</code> - The fingerprints and both tier keys.  

| Param | Description |
| --- | --- |
| args | The inputs to fingerprint. |
| args.file | The source file. |
| args.cwd | The run's working directory (cache keys are cwd-relative). |
| args.file.absPath | The absolute path of the source file. |
| args.file.extension | The source extension (e.g. `.ts`). |
| args.srcText | The source text (already read by the caller). |
| args.distMaterial | Dist-side material from [distMaterialOf](#distMaterialOf), or `null`. |
| args.isTypeScript | Whether the file is `.ts`-family. |
| args.programFp | [programFingerprint](#programFingerprint) of the run, or `null` for .js. |
| args.toolchainFp | [toolchainFingerprint](#toolchainFingerprint) of the run. |

src: src/cache.ts:188  
dist: dist/cache.js:153
<a name="lockfileFingerprint"></a>

## lockfileFingerprint(cwd) ⇒ <code>Promise&lt;string&gt;</code>
The sha256 of the lockfile in `cwd`, or `undefined` when absent/unreadable.

**Kind**: global function  
**Returns**: <code>Promise&lt;string&gt;</code> - The lockfile digest.  

| Param | Type | Description |
| --- | --- | --- |
| cwd | <code>string</code> | The run's working directory. |

src: src/cache.ts:220  
dist: dist/cache.js:176
<a name="programFingerprint"></a>

## programFingerprint(args) ⇒ <code>Promise&lt;string&gt;</code>
The whole-program fingerprint for .ts files — every source and declaration
file under the project roots, plus the lockfile and the TypeScript version.
Covers first-party `.d.ts` files that are imported but never roots.
Node_modules trees behind a lockfile are pinned by the lockfile hash; trees
drifted from their lockfile (postinstall patches) can serve stale types.

**Kind**: global function  
**Returns**: <code>Promise&lt;string&gt;</code> - A sha256 hex digest.  

| Param | Description |
| --- | --- |
| args | The inputs to fingerprint. |
| args.tsFiles | Absolute paths of every `.ts`-family file in the run (in any order). |
| args.sweep | Absolute paths of every `.d.ts` under the project roots (in any order). |
| args.lock | sha256 of the lockfile, or `undefined` when absent. |

src: src/cache.ts:244  
dist: dist/cache.js:200
<a name="sweepDeclarations"></a>

## sweepDeclarations(srcDirs, cap) ⇒ <code>Promise&lt;string[]&gt;</code>
Finds every `.d.ts` under the project roots (capped at [DTS_SWEEP_CAP](#DTS_SWEEP_CAP)).

**Kind**: global function  
**Returns**: <code>Promise&lt;string[]&gt;</code> - Absolute paths of declaration files, in stable sorted order.  

| Param | Type | Description |
| --- | --- | --- |
| srcDirs | <code>readonly string[]</code> | The resolved project source directories. |
| cap | <code>number</code> | The maximum number of declaration files to collect (default [DTS_SWEEP_CAP](#DTS_SWEEP_CAP)). |

src: src/cache.ts:258  
dist: dist/cache.js:215
<a name="toolchainFingerprint"></a>

## toolchainFingerprint() ⇒ <code>string</code>
Computes the cache fingerprint of the toolchain — everything about the
installed mdocs + jsdoc + TypeScript that can shape the rendered output.

**Kind**: global function  
**Returns**: <code>string</code> - A sha256 hex digest.  
src: src/cache.ts:276  
dist: dist/cache.js:234
<a name="evict"></a>

## evict(entries, overflow)
Drops the least-valuable entries until only `cap` remain.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| entries | <code>Map&lt;string, { fp: string; issues: string[]; kind: &quot;md&quot; \| &quot;tdata&quot;; lastUsed: number; symbols: number; doclets?: Record&lt;string, unknown&gt;[]; markdown?: string; skipped?: &quot;no-jsdoc&quot;; }&gt;</code> | The entry map to trim in place. |
| overflow | <code>number</code> | How many entries to drop. |

src: src/cache.ts:290  
dist: dist/cache.js:246
<a name="evictionClass"></a>

## evictionClass(entry) ⇒ <code>number</code>
Eviction class: no-jsdoc skips first, then tdata, then full markdown.

**Kind**: global function  
**Returns**: <code>number</code> - 0 for skips, 1 for tdata, 2 for markdown.  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>{ fp: string; issues: string[]; kind: &quot;md&quot; \| &quot;tdata&quot;; lastUsed: number; symbols: number; doclets?: Record&lt;string, unknown&gt;[]; markdown?: string; skipped?: &quot;no-jsdoc&quot;; }</code> | The entry to classify. |

src: src/cache.ts:302  
dist: dist/cache.js:259
<a name="hashFile"></a>

## hashFile(path) ⇒ <code>Promise&lt;string&gt;</code>
Sha256 hex of a file's contents, or `UNREADABLE` when it cannot be read.

**Kind**: global function  
**Returns**: <code>Promise&lt;string&gt;</code> - The hex digest, or the `UNREADABLE` sentinel.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The absolute path of the file to fingerprint. |

src: src/cache.ts:312  
dist: dist/cache.js:269
<a name="packageVersionOf"></a>

## packageVersionOf(name) ⇒ <code>string</code>
Version of an installed package, walking up from its entry point; `?` on failure.

**Kind**: global function  
**Returns**: <code>string</code> - The package version, or `?` when it cannot be resolved.  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | The package name to look up. |

src: src/cache.ts:326  
dist: dist/cache.js:283
<a name="readManifest"></a>

## readManifest(manifestPath, name) ⇒ <code>string</code>
Reads one `package.json`, returning its version when it names `name`.

**Kind**: global function  
**Returns**: <code>string</code> - The package version, or `undefined` when the file is unusable.  

| Param | Type | Description |
| --- | --- | --- |
| manifestPath | <code>string</code> | Absolute path of the candidate manifest. |
| name | <code>string</code> | The expected package name. |

src: src/cache.ts:352  
dist: dist/cache.js:311
<a name="sha256"></a>

## sha256(text) ⇒ <code>string</code>
Sha256 hex digest of `text`.

**Kind**: global function  
**Returns**: <code>string</code> - The lowercase hex digest.  

| Param | Description |
| --- | --- |
| text | The string or buffer to hash. |

src: src/cache.ts:369  
dist: dist/cache.js:329
