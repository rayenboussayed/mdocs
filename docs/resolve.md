## Constants

<dl>
<dt><a href="#DECLARATION_FILE">DECLARATION_FILE</a></dt>
<dd><p>Declaration files (<code>.d.ts</code>/<code>.d.mts</code>/<code>.d.cts</code>) are not documentable — they carry no JSDoc.</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#collectSourceFiles">collectSourceFiles(projects)</a> ⇒ <code>Promise&lt;CollectResult&gt;</code></dt>
<dd><p>Recursively collects the documentable source files of every project,
skipping <code>node_modules</code>, VCS internals, declaration files and the generated
docs directory itself. Returns the files plus any non-fatal notes (e.g.
unreadable directories, which are skipped rather than aborting the run).</p>
<p>Throws <code>MdocsError</code> <code>OUTPUT_COLLISION</code> when two source files would
produce the same <code>.md</code> path (e.g. <code>dup.ts</code> and <code>dup.mjs</code>) — that is a hard
error, not something to silently overwrite.</p>
</dd>
<dt><a href="#isTypeScriptExtension">isTypeScriptExtension(extension)</a> ⇒ <code>boolean</code></dt>
<dd><p>Narrows a raw extension to <code>.ts</code>-family (transpiled before jsdoc).</p>
</dd>
<dt><a href="#outputPathFor">outputPathFor(file)</a> ⇒ <code>string</code></dt>
<dd><p>Output path for a source file: <code>&lt;outDir&gt;/&lt;relPath with .md extension&gt;</code>.
Contained by construction — <code>relPath</code> comes from <code>walkFiles(project.srcDir)</code>,
so it is relative with no <code>..</code> ascent.</p>
</dd>
<dt><a href="#probeMissingDistDirs">probeMissingDistDirs(projects)</a> ⇒ <code>Promise&lt;Set&lt;string&gt;&gt;</code></dt>
<dd><p>Probes each project&#39;s dist folder exactly once. Missing or non-directory
dist folders are returned so the run can omit dist pointers and warn.</p>
</dd>
<dt><a href="#resolveProjects">resolveProjects(config, cwd)</a> ⇒ <code>Promise&lt;ProjectRoot[]&gt;</code></dt>
<dd><p>Expands <code>config.rootSrcDir</code> to concrete <code>ProjectRoot</code>s.</p>
</dd>
<dt><a href="#assertNoOutputCollisions">assertNoOutputCollisions(files)</a></dt>
<dd><p>Fails the whole run when two files in one project would write the same
<code>.md</code> — that is a configuration problem, not a rendering failure.</p>
</dd>
<dt><a href="#assertNoOverlappingRoots">assertNoOverlappingRoots(roots)</a></dt>
<dd><p>Rejects roots where one src directory is nested inside another.</p>
</dd>
<dt><a href="#expandGlob">expandGlob(pattern, cwd)</a> ⇒ <code>Promise&lt;string[]&gt;</code></dt>
<dd><p>Expands a glob pattern against <code>cwd</code>, returning canonical directory paths.
A pattern that matches only files is reported distinctly from one that
matches nothing at all.</p>
</dd>
<dt><a href="#isSourceExtension">isSourceExtension(extension)</a> ⇒ <code>boolean</code></dt>
<dd><p>Narrows a raw extension to <code>SourceExtension</code>.</p>
</dd>
<dt><a href="#lowerExtension">lowerExtension(absPath)</a> ⇒ <code>string</code></dt>
<dd><p>Lower-cased file extension including the dot.</p>
</dd>
<dt><a href="#requireDirectory">requireDirectory(path)</a> ⇒ <code>Promise&lt;string&gt;</code></dt>
<dd><p>Stats <code>path</code>, requiring an existing directory; returns its realpath.</p>
</dd>
<dt><a href="#toPosix">toPosix(path)</a> ⇒ <code>string</code></dt>
<dd><p>POSIX-style relative path (forward slashes).</p>
</dd>
<dt><a href="#walkFiles">walkFiles(dir, issues)</a> ⇒ <code>Promise&lt;string[]&gt;</code></dt>
<dd><p>Recursively lists files under <code>dir</code>, never following directory symlinks.</p>
</dd>
</dl>

<a name="DECLARATION_FILE"></a>

## DECLARATION\_FILE
Declaration files (`.d.ts`/`.d.mts`/`.d.cts`) are not documentable — they carry no JSDoc.

**Kind**: global constant  
src: src/resolve.ts:28  
dist: dist/resolve.js:24
<a name="collectSourceFiles"></a>

## collectSourceFiles(projects) ⇒ <code>Promise&lt;CollectResult&gt;</code>
Recursively collects the documentable source files of every project,
skipping `node_modules`, VCS internals, declaration files and the generated
docs directory itself. Returns the files plus any non-fatal notes (e.g.
unreadable directories, which are skipped rather than aborting the run).

Throws `MdocsError` `OUTPUT_COLLISION` when two source files would
produce the same `.md` path (e.g. `dup.ts` and `dup.mjs`) — that is a hard
error, not something to silently overwrite.

**Kind**: global function  
**Returns**: <code>Promise&lt;CollectResult&gt;</code> - The files plus any non-fatal notes (unreadable directories skipped).  

| Param | Type | Description |
| --- | --- | --- |
| projects | <code>readonly ProjectRoot[]</code> | The resolved projects to collect from. |

src: src/resolve.ts:74  
dist: dist/resolve.js:40
<a name="isTypeScriptExtension"></a>

## isTypeScriptExtension(extension) ⇒ <code>boolean</code>
Narrows a raw extension to `.ts`-family (transpiled before jsdoc).

**Kind**: global function  
**Returns**: <code>boolean</code> - `true` for `.ts`/`.tsx`/`.mts`/`.cts`.  

| Param | Type | Description |
| --- | --- | --- |
| extension | <code>&quot;.js&quot; \| &quot;.jsx&quot; \| &quot;.mjs&quot; \| &quot;.cjs&quot; \| &quot;.ts&quot; \| &quot;.tsx&quot; \| &quot;.mts&quot; \| &quot;.cts&quot;</code> | The source extension (with leading dot). |

src: src/resolve.ts:96  
dist: dist/resolve.js:63
<a name="outputPathFor"></a>

## outputPathFor(file) ⇒ <code>string</code>
Output path for a source file: `<outDir>/<relPath with .md extension>`.
Contained by construction — `relPath` comes from `walkFiles(project.srcDir)`,
so it is relative with no `..` ascent.

**Kind**: global function  
**Returns**: <code>string</code> - The absolute output path for the `.md` file.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>SourceFile</code> | The source file being written out. |

src: src/resolve.ts:107  
dist: dist/resolve.js:73
<a name="probeMissingDistDirs"></a>

## probeMissingDistDirs(projects) ⇒ <code>Promise&lt;Set&lt;string&gt;&gt;</code>
Probes each project's dist folder exactly once. Missing or non-directory
dist folders are returned so the run can omit dist pointers and warn.

**Kind**: global function  
**Returns**: <code>Promise&lt;Set&lt;string&gt;&gt;</code> - The absolute distDirs that are absent or not directories.  

| Param | Type | Description |
| --- | --- | --- |
| projects | <code>readonly ProjectRoot[]</code> | The resolved projects to probe. |

src: src/resolve.ts:118  
dist: dist/resolve.js:83
<a name="resolveProjects"></a>

## resolveProjects(config, cwd) ⇒ <code>Promise&lt;ProjectRoot[]&gt;</code>
Expands `config.rootSrcDir` to concrete `ProjectRoot`s.

**Kind**: global function  
**Returns**: <code>Promise&lt;ProjectRoot[]&gt;</code> - The resolved projects (one per src directory).  
**Throws**:

- <code>MdocsError</code> `NO_ROOTS` when nothing matches, `OVERLAPPING_ROOTS`
  when one src dir contains another, `INVALID_ROOT` for unreadable/non-dir
  entries.


| Param | Type | Description |
| --- | --- | --- |
| config | <code>ResolvedMdocsConfig</code> | The resolved config (roots and output directory names). |
| cwd | <code>string</code> | Base directory for relative entries and glob expansion. |

src: src/resolve.ts:145  
dist: dist/resolve.js:110
<a name="assertNoOutputCollisions"></a>

## assertNoOutputCollisions(files)
Fails the whole run when two files in one project would write the same
`.md` — that is a configuration problem, not a rendering failure.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| files | <code>readonly SourceFile[]</code> | The collected files to check for colliding outputs. |

src: src/resolve.ts:183  
dist: dist/resolve.js:146
<a name="assertNoOverlappingRoots"></a>

## assertNoOverlappingRoots(roots)
Rejects roots where one src directory is nested inside another.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| roots | <code>readonly string[]</code> | The resolved source directories to validate. |

src: src/resolve.ts:203  
dist: dist/resolve.js:167
<a name="expandGlob"></a>

## expandGlob(pattern, cwd) ⇒ <code>Promise&lt;string[]&gt;</code>
Expands a glob pattern against `cwd`, returning canonical directory paths.
A pattern that matches only files is reported distinctly from one that
matches nothing at all.

**Kind**: global function  
**Returns**: <code>Promise&lt;string[]&gt;</code> - The matched directories (absolute paths).  

| Param | Type | Description |
| --- | --- | --- |
| pattern | <code>string</code> | The glob pattern to expand (against `cwd`). |
| cwd | <code>string</code> | Base directory for relative patterns. |

src: src/resolve.ts:229  
dist: dist/resolve.js:189
<a name="isSourceExtension"></a>

## isSourceExtension(extension) ⇒ <code>boolean</code>
Narrows a raw extension to `SourceExtension`.

**Kind**: global function  
**Returns**: <code>boolean</code> - `true` for the eight supported source extensions.  

| Param | Type | Description |
| --- | --- | --- |
| extension | <code>string</code> | The raw extension to test. |

src: src/resolve.ts:261  
dist: dist/resolve.js:221
<a name="lowerExtension"></a>

## lowerExtension(absPath) ⇒ <code>string</code>
Lower-cased file extension including the dot.

**Kind**: global function  
**Returns**: <code>string</code> - The lower-cased extension (with leading dot), or `''` for dotfiles.  

| Param | Type | Description |
| --- | --- | --- |
| absPath | <code>string</code> | Absolute path of the file. |

src: src/resolve.ts:270  
dist: dist/resolve.js:229
<a name="requireDirectory"></a>

## requireDirectory(path) ⇒ <code>Promise&lt;string&gt;</code>
Stats `path`, requiring an existing directory; returns its realpath.

**Kind**: global function  
**Returns**: <code>Promise&lt;string&gt;</code> - The canonical (realpath) directory path.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The path to check. |

src: src/resolve.ts:281  
dist: dist/resolve.js:239
<a name="toPosix"></a>

## toPosix(path) ⇒ <code>string</code>
POSIX-style relative path (forward slashes).

**Kind**: global function  
**Returns**: <code>string</code> - The path with forward slashes.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The path to normalize. |

src: src/resolve.ts:306  
dist: dist/resolve.js:265
<a name="walkFiles"></a>

## walkFiles(dir, issues) ⇒ <code>Promise&lt;string[]&gt;</code>
Recursively lists files under `dir`, never following directory symlinks.

**Kind**: global function  
**Returns**: <code>Promise&lt;string[]&gt;</code> - The absolute paths of the files found.  

| Param | Type | Description |
| --- | --- | --- |
| dir | <code>string</code> | The directory to walk. |
| issues | <code>string[]</code> | Per-run notes accumulator (unreadable directories). |

src: src/resolve.ts:316  
dist: dist/resolve.js:274
