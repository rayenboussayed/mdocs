# mdocs

Markdown documentation for JavaScript and TypeScript source files, generated from JSDoc comments.

`mdocs` is a thin, opinionated CLI around [`jsdoc-to-markdown`](https://www.npmjs.com/package/jsdoc-to-markdown). It reads an `mdocs.config.js` (vite-style), walks your source directories, and writes **one `.md` file per source file** — not one giant document.

Every documented symbol carries two extra pointer lines that tell you where the symbol lives in the source and in the build output:

```text
src: src/file.ts:19
dist: dist/file.js:10
```

- **src** — the exact line in the source file, relative to the directory you run `mdocs` from (the workspace root).
- **dist** — the corresponding line in the compiled output, so a reader can jump straight to the shipped code.

For `.ts` files the parameter types are resolved with the TypeScript compiler API (a snapshot of the truth at the moment the docs are generated), not guessed from the JSDoc comment. For `.js` files the types come from the JSDoc annotations themselves.

- **License:** MIT
- **Runtime:** Node.js ≥ 22.17, ESM only

---

## Table of contents

1. [Install and quickstart](#install)
2. [Configuration reference](#configuration-reference)
3. [`mdocs.config.js`](#mdocsconfigjs)
4. [CLI reference](#cli-reference)
5. [Output format](#output-format)
6. [How types are resolved](#how-types-are-resolved)
7. [Monorepo recipe](#monorepo-recipe)
8. [JSDoc authoring quick reference](#jsdoc-authoring-quick-reference)
9. [Limitations and FAQ](#limitations-and-faq)
10. [Security note](#security-note)
11. [License and contributing](#license-and-contributing)
12. [Benchmarking](#benchmarking)

---

## Install

```sh
npm install --save-dev mdocs
```

> **Release status:** the package is not published yet. The `mdocs` name on npm is
> held by the npm registry itself, so the published package will very likely ship
> under a different name (`mdocs-cli` is verified free). Until then, run it from a
> checkout with `node dist/cli.js`, or `npm link` it.

`mdocs` is a dev dependency — it only reads your source and writes markdown.

---

## Quickstart

### (a) Regular repository

Nothing to configure. With the default config (`rootSrcDir: 'src'`, `rootDistDir: 'dist'`, `outDirName: 'docs'`):

```sh
npx mdocs
```

Result:

```text
my-app/
├── src/
│   ├── index.ts
│   └── client.ts
├── dist/
│   ├── index.js
│   └── client.js
└── docs/            ← created
    ├── index.md
    └── client.md
```

The `docs/` folder is created next to `src/` and mirrors the source tree.

### (b) Monorepo

Point `rootSrcDir` at one or more globs. Every matched source directory gets its own `docs/` folder as a sibling.

`mdocs.config.js`:

```js
import { defineConfig } from 'mdocs'

export default defineConfig({
  rootSrcDir: ['packages/*/src']
})
```

After `npx mdocs`:

```text
my-monorepo/
└── packages/
    ├── core/
    │   ├── src/
    │   └── docs/     ← created
    │       ├── index.md
    │       └── client.md
    └── cli/
        ├── src/
        └── docs/     ← created
            └── main.md
```

The `dist:` pointers resolve per package: `packages/core/src/client.ts` → `packages/core/dist/client.js`.

You can also skip the config file entirely and pass the roots as positional arguments (quote the glob so your shell does not expand it):

```sh
mdocs 'packages/*/src'
```

### (c) TypeScript package with npm scripts

```json
{
  "name": "my-ts-package",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "docs": "mdocs"
  },
  "devDependencies": {
    "mdocs": "^1.0.0"
  }
}
```

```sh
npm run build   # build first — the dist: pointers need a real build output
mdocs           # writes docs/*.md next to src/ (npx mdocs when installed as a dev dep)
```

---

## Configuration reference

All options are optional. The config file is looked up in the current working directory as `mdocs.config.js`, `mdocs.config.mjs`, or `mdocs.config.cjs` (in that order), unless `--config <path>` is given. If no config file exists, mdocs falls back to the defaults below.

| Key           | Type                 | Default  | Description |
| ------------- | -------------------- | -------- | ----------- |
| `rootSrcDir`  | `string \| string[]` | `'src'`  | Source directories to document. Each entry is a directory or a glob (e.g. `'packages/*/src'`). Every match gets its own `docs/` folder. |
| `rootDistDir` | `string`             | `'dist'` | Name of the build-output directory, resolved as a sibling of each source directory. Used only for the `dist:` pointer lines. Nested names like `'build/output'` are allowed. |
| `outDirName`  | `string`             | `'docs'` | Name of the directory the generated markdown is written to, resolved as a sibling of each source directory. Nested names like `'docs/api'` are allowed. |
| `parallelism` | `boolean \| number`  | `true`   | `true` = an in-process promise pool sized to the available CPU cores. A number = pool size (1–1024). `false` = sequential. Note: this is not `worker_threads` — concurrency comes from spawning jsdoc processes. |
| `cache`       | `boolean`            | `true`   | Enable the render cache. Omitted or `true` reads `.mdocscache` and reuses renders for unchanged files. `false` (or `--no-cache`) bypasses it — no read, no write. |
| `cachePath`   | `string`             | `'.mdocscache'` | Where the cache is written, resolved against the working directory. Must be a relative path without `..` and without absolute paths. Nested names like `'.cache/mdocs'` are allowed. |

**Precedence:** CLI flags / positional arguments > config file > built-in defaults.

**Validation** (zod-validated — a malformed config fails before a single file is written):

- Unknown keys are an error — only the six keys above are accepted.
- `rootSrcDir` must be a string or a non-empty array of strings. A glob that matches **no directories** is a hard error, so a typo cannot silently generate zero docs.
- `rootDistDir`, `outDirName` and `cachePath` must be relative paths without `..` and without absolute paths.
- `parallelism` must be `true`, `false`, or an integer between 1 and 1024.
- `cache` must be a boolean.
- Two `rootSrcDir` entries may not overlap (one nested in another) — the same files would be documented twice.

### `defineConfig`

`defineConfig` is a typed identity helper — it returns exactly what you pass in, so it can be used to autocomplete the option names without changing the runtime behaviour.

Object form:

```js
import { defineConfig } from 'mdocs'

export default defineConfig({
  rootSrcDir: 'src',
})
```

Function form — evaluated when the config is loaded:

```js
import { defineConfig } from 'mdocs'

export default defineConfig(({ command, mode }) => ({
  rootSrcDir: mode === 'production' ? 'src' : ['src', 'experiments']
}))
```

| Field     | Value |
| --------- | ----- |
| `command` | Always `'build'` — mdocs only generates artifacts. |
| `mode`    | `process.env.NODE_ENV` if it is `development`, `test` or `production`, otherwise `'production'`. |

### ESM config

`mdocs.config.js` in a `"type": "module"` package:

```js
import { defineConfig } from 'mdocs'

export default defineConfig({
  rootSrcDir: 'src',
  rootDistDir: 'dist',
  outDirName: 'docs',
  parallelism: true
})
```

### CommonJS config

`mdocs.config.js` in a CommonJS package:

```js
module.exports = {
  rootSrcDir: 'src',
  rootDistDir: 'dist',
  outDirName: 'docs',
  parallelism: true
}
```

An ESM config written into a `.js` file inside a CommonJS package also works: mdocs tries `require()` first and, for the cases Node rejects (ESM syntax — current Node raises a plain `SyntaxError`), falls back to a sibling `.mjs` copy. Use `mdocs.config.cjs` if you want the CommonJS behaviour to be explicit.

### Programmatic use

```js
import { run } from 'mdocs'

const result = await run({
  cwd: process.cwd(),
  rootSrcDir: ['packages/*/src'],   // merged over mdocs.config.*, if any
  parallelism: 4,
})

console.log(result.written, result.failed, result.skipped)
```

`run()` never calls `process.exit` and reports failures in the result object.

---

## CLI reference

```text
mdocs [options] [rootSrcDir...]
```

| Option                           | Default                                          | Description |
| -------------------------------- | ------------------------------------------------ | ----------- |
| `rootSrcDir...`                  | (config)                                          | Positional source directories (globs allowed). Overrides `rootSrcDir` from the config file. |
| `--config <path>`                | auto-detect `mdocs.config.{js,mjs,cjs}`           | Path to the config file. |
| `--root-dist-dir <name>`         | `dist`                                            | Name of the build-output directory next to each source directory. |
| `--out-dir-name <name>`          | `docs`                                            | Name of the directory the markdown is written to. |
| `--parallelism <true\|false\|N>`  | `true`                                            | Worker pool size. |
| `--dry-run`                      | `false`                                           | Print the planned writes without writing anything. |
| `--no-cache`                     | (from config, default on)                          | Disable the render cache for this run. |
| `--verbose`                      | `false`                                           | Print resolved settings, per-file writes, skips and notes. |
| `-v, --version`                  | —                                                 | Print the version and exit. |
| `-h, --help`                     | —                                                 | Show help and exit. |

Without `--config`, mdocs looks for the config in the current working directory and falls back to the built-in defaults if none exists.

```sh
mdocs                                   # use mdocs.config.js (or defaults)
mdocs --config ./config/mdocs.prod.mjs  # use a specific config
mdocs src                               # document ./src, ignore config rootSrcDir
mdocs 'packages/*/src'                  # document every package, quote the glob
mdocs --out-dir-name api-docs           # write to ./api-docs instead of ./docs
mdocs --parallelism false               # single process
mdocs --parallelism 8                   # an eight-way pool
mdocs --dry-run                         # show what would be written
mdocs --no-cache                        # ignore the render cache (use for benchmarking / CI debugging)
mdocs --verbose                         # explain everything
```

---

## Output format

### Source

`src/math.ts`:

```ts
/**
 * Adds two numbers.
 * @param a - first addend
 * @param b - second addend
 * @returns the sum
 */
export function add(a: number, b: number): number { return a + b }
```

### Generated `docs/math.md`

<!-- prettier-ignore -->
````markdown
## add(a, b) ⇒ <code>number</code>
Adds two numbers.

**Kind**: global function  
**Returns**: <code>number</code> - the sum

| Param | Type | Description |
| --- | --- | --- |
| a | <code>number</code> | first addend |
| b | <code>number</code> | second addend |

src: src/math.ts:8  
dist: dist/math.js:7
````

Notes on the format:

- The body is the standard `jsdoc-to-markdown` rendering of the symbol (heading, description, `**Kind**`, param table, example blocks).
- The `src:` and `dist:` lines are printed at the end of the symbol's block, before the member listing (classes) and before the next symbol. The `dist:` line is only printed when a usable build exists.
- Paths are relative to the directory you run `mdocs` from (the workspace root), not absolute OS paths.
- When the build output has no usable source map, the dist pointer is marked approximate:

  ```text
  dist: dist/math.js:7 (approx.)
  ```

  and a note is printed with `--verbose`.
- If the dist file does not exist at all, the `dist:` line is omitted entirely — the symbol carries only the `src:` pointer — and a note is recorded per file (visible with `--verbose`). A missing `dist/` folder is reported once on stderr and recorded once per project. Neither is an error: the exit code stays `0`.
- The relative directory structure of the source tree is preserved under the output folder, so `src/nested/bar.ts` becomes `docs/nested/bar.md`.

### Class example

```ts
/** A repository for users. */
export class UserRepository {
  /**
   * Finds a user by id.
   * @param id - The user id.
   * @returns The user, or `null`.
   */
  findById(id: string): User | null { return null }
}
```

renders `docs/….md` with `## UserRepository` followed by the `.findById()` block. Constructor doclets inherit the class's `@param` tags but **carry no line information** (jsdoc does not emit one for them), so the constructor block has no `src:`/`dist:` lines — the class block carries them.

---

## How types are resolved

### `.ts` files — TypeScript compiler API

For TypeScript sources, mdocs builds a single TypeScript `Program` over your project's source files and asks the **type checker** for the resolved type of every parameter. The types shown in the param table are the ones the compiler resolved at the moment the docs were generated — a snapshot of the truth at run time, not a stale build artifact.

Consequences:

- A parameter typed `string` in the signature shows `string`, even if the JSDoc says `{*}` or says nothing.
- When the checker resolves a parameter to `any` (typically an untyped parameter documented via JSDoc), the JSDoc annotation wins — the type column never silently downgrades.
- Optional parameters, generics, unions and imported types are rendered as the checker prints them.
- The program is created once per run, not per file.
- This does not type-check your project — errors in the source do not stop mdocs; the checker still answers, often with `any`.

### `.js` files — JSDoc annotations

For JavaScript sources there is no compiler check to lean on, so types come from the JSDoc annotations themselves:

```js
/**
 * @param {string} name - The user name.
 * @returns {Promise<string>} The greeting.
 */
```

If a `@param` has no `{type}`, the type column is empty. Add one.

### The `dist:` pointer

To find the line of a symbol in the compiled output, mdocs reads the build's source map (`dist/foo.js.map`) and resolves the original↔generated positions through it. This matters more than it sounds: `tsc` elides blank lines between top-level declarations, so the compiled line numbers drift steadily lower than the source ones.

- The `dist:` line is **exact** when the source map is present and covers the file.
- The `dist:` line is marked **`(approx.)`** when `dist/<file>.js.map` is missing (a `sourceMap: true` build fixes this) or when it does not cover the file. The position is then inferred.
- The `dist:` line is **omitted** when the `dist/` folder is missing at run time (one stderr warning per project) or when the individual `dist/<file>.js` is missing (one issue per file).
- Class member symbols, `interface`s, `type` aliases (erased at compile time) have no `dist:` line.

---

## Monorepo recipe

### pnpm workspaces

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

`mdocs.config.js` at the repository root:

```js
import { defineConfig } from 'mdocs'

export default defineConfig({
  rootSrcDir: ['packages/*/src'],
  parallelism: true
})
```

```json
{
  "scripts": {
    "docs": "pnpm run build && mdocs"
  }
}
```

### npm workspaces

The same setup works with npm workspaces — only the workspace declaration differs:

```json
{
  "workspaces": ["packages/*"],
  "scripts": {
    "docs": "npm run build && mdocs"
  }
}
```

### Notes

- **Build first.** mdocs reads your build output; it never builds it.
- **One `docs/` per package.** Each matched `packages/*/src` gets `packages/*/docs`.
- **Types across packages.** The TypeScript program resolves imports through the workspace. If a package imports types from a sibling, build the sibling first so its `.d.ts` exist.
- **Per-package invocations.** Run mdocs once at the repository root with the glob; do not run it once per package.
- **Different dist layouts.** If packages emit to different folder names, normalise them or run mdocs per package with `--root-dist-dir`.
- **A missing package is an error.** `rootSrcDir: ['packages/*/src']` fails loudly when the glob matches nothing.

---

## JSDoc authoring quick reference

| Tag | Applies to | Notes |
| --- | ---------- | ----- |
| `@param {type} name - description` | functions, methods | `{type}` is optional for `.ts` (the checker fills it in). Required for `.js`. |
| `@returns {type} description` | functions | |
| `@example` | any | Rendered as a fenced code block. `@lang ts` picks the language. |
| `@template T` | generics | |
| `@typedef {Object} Name` + `@property` | type shapes | |
| `@throws {type} description` | functions | |
| `@deprecated` | any | Renders a deprecation notice. |
| `@see` | any | Cross-reference another symbol or a URL. |
| *(plain block above `class`)* | classes | A doc comment directly above the class documents the class. |

Class example:

```js
/**
 * A repository for users.
 */
export class UserRepository {
  /**
   * Finds a user by id.
   * @param {string} id - The user id.
   * @returns {User | null} The user, or `null`.
   */
  findById(id) {
    return null
  }
}
```

`@private` / `@ignore` symbols are excluded from the output. Undocumented files are skipped entirely — no empty `.md` file is created.

---

## Limitations and FAQ

**mdocs is a documentation generator, not a type checker.** It never reports type errors and never fails because your project does not type-check.

**JSDoc is static.** Only what you write in the comment shows up; there is no inference from the implementation beyond the parameter types.

**`.ts` files are transpiled to a scratch directory first.** jsdoc cannot read TypeScript reliably, so mdocs transpiles each file to JavaScript in a temporary folder, runs jsdoc over it, and uses the scratch source map to map every position back to the original `.ts`. The scratch directory is removed after the run. The same pipeline is used for `.js`/`.mjs` (a verbatim copy), so all pointer lines come from the same mechanism.

**Interfaces and type aliases are not documented.** They are erased at compile time, so no doclet exists for them. Document values — functions, classes, methods, constants — and give their types `@typedef` if you need them described.

**The `dist:` line depends on your build.** For exact positions, `dist/` must be built from the same sources (same `sourceMap` setting). A `dist/` built with different options, or without `sourceMap`, yields `(approx.)` pointers instead. If no `dist/` has been built at all, or a file's `.js` has no counterpart, no `dist:` line is emitted and a single warning/issue is recorded instead.

**Caching.** mdocs keeps a **render cache** enabled by default: it stores per-file results in a single content-addressed JSON file at `<cwd>/.mdocscache` (configurable with `cachePath`, disableable with `cache: false` or `mdocs --no-cache`). Two tiers are kept — the raw template data returned by jsdoc-to-markdown (skips the jsdoc child process), and the finished markdown (skips everything, including the TypeScript program). Cache keys are content fingerprints (source text, the whole TS program for `.ts` files, the `dist` map, and the toolchain version), never absolute paths, and the cache never contains output for files that failed to render. The jsdoc analysis cache itself is disabled — mdocs passes `no-cache` on every invocation (a fresh scratch directory can never produce a hit, so the cache would only grow). You may see `~/.jsdoc-api` created at import time by `jsdoc-api`; it holds no cache files.

**Output is overwritten, not merged.** Each run regenerates the affected `*.md` files. Files in the output folder that mdocs did not generate are left alone.

**Which files are picked up.** `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`. Declaration files (`.d.ts`, `.d.mts`, `.d.cts`) and anything inside `node_modules`, `.git`, `.hg` or `.svn` are skipped. Directory symlinks are not followed.

**Files without JSDoc are skipped** — no error, no `.md` output. Same for individual symbols without doc comments: they are omitted.

**Constructor doclets** inherit the class's `@param` tags (they get the TypeScript types) but have no line information, so the class's `src:`/`dist:` lines live in the class block.

**Exit codes.**

| Code | Meaning |
| ---- | ------- |
| `0`  | Documentation generated successfully. Also `--help` and `--version`. |
| `1`  | Something failed — the config could not be loaded, a source file could not be read/written, jsdoc failed, or the CLI arguments were invalid. The reason is printed to stderr. |

**Does mdocs run my build?** No. It only reads `dist/` if it is already there.

**Can I commit the `.mdocscache` file?** Yes — this repository does. It is a checked-in convenience for warm CI runs on an unchanged tree (keys are cwd-relative and fingerprinted over contents, so any clone with the same layout hits it). Cost: it is ~200 KB and churns each time the source or the toolchain changes, which is most commits that regenerate it — remember to regenerate it with `node dist/cli.js` after touching anything that affects output. It is always safe to delete; the next run simply rebuilds it.

**Can I commit the generated docs?** Yes — that is the normal workflow. Add `docs/` to `.gitignore` if you would rather publish them from CI.

**Can I use a different config filename?** Yes, with `--config <path>`.

**Environment variables.** `NODE_ENV` selects the config function's `mode`; `MDOCS_DEBUG=1` prints stack traces on unexpected errors. `NO_COLOR` is accepted for CI compatibility (mdocs never emits ANSI color). `JSDOC_PATH` is ignored by mdocs — it never lets the environment relocate the jsdoc binary.

---

## Security note

**`mdocs.config.js` is executable code.** Like `vite.config.js`, `webpack.config.js` or any other JS config, it is imported and run by Node with your full user permissions at startup. It can `import` arbitrary modules, read environment variables, spawn processes and write files.

- Only run `mdocs` in repositories you trust.
- Review `mdocs.config.js` before running it in CI, especially on pull requests from forks — a hostile PR can change that file and get code execution in your CI runner.
- Pin a known-good config explicitly with `mdocs --config ./config/mdocs.safe.js`.
- **Your source files are parsed, not executed.** jsdoc never runs your project code, and mdocs passes only `files` + `no-cache` + its own template partials to jsdoc-to-markdown — the options that would allow arbitrary `require()` of your code (`configure`, `plugin`, `helper`, `partial`, `template`) are deliberately not exposed.
- The jsdoc child process inherits your environment, including `NODE_OPTIONS` and any secrets it contains. Do not run mdocs in an environment controlled by someone you do not trust. `JSDOC_PATH` is removed by mdocs so the parser cannot be relocated.
- Output `.md` files stay inside each project's resolved `outDir` by construction: `outDirName` is validated as a relative path (no `..`, no absolute paths) and the output path is derived from the source tree's relative path.
- Generated docs contain your source comments, examples and file paths. If your source is sensitive, the output is too.
- The `.mdocscache` file is untrusted input: it is validated with zod at load and used only as inert data (markdown/doclets are never required, imported or evaluated). A tampered cache can alter the markdown written to your `*.md` files, never which files are read or what gets executed. If in doubt, delete the file — the next run rebuilds it from source.
- Use `--dry-run` to see exactly which files would be written before committing to a run in an unfamiliar repository.

---

## License and contributing

MIT © the mdocs contributors.

Contributions are welcome. Please open an issue describing the problem or feature before starting on a large change, and keep pull requests focused — a change to the CLI surface, the config schema, or the output format should come with an update to this README.

```sh
git clone <repository-url>   # repository URL pending the project's move to its public home
npm install
npm run check                # typecheck, lint, knip, tests (coverage gate)
```

---

## Benchmarking

mdocs ships an informational benchmark suite under `test/bench/` (not gated, not in `npm test`). Latency benchmarks cover the hot paths (`vitest bench`); the memory suite reports parent-process footprints across four scenarios.

```sh
npm run bench          # latency tables (verbose reporter)
npm run bench:memory   # memory scenarios, sets --expose-gc
MDOCS_BENCH_FILES=24 npm run bench:memory   # scale the synthetic corpus (default 120, max 1024)
```

Numbers are machine-dependent — same-machine A/B only, never absolute thresholds. See [`test/bench/README.md`](test/bench/README.md) for what each scenario measures and how to read the output.

---

*Generated with mdocs.*
