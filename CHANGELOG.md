# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-16

### Added

- Vite-style CLI and library (`mdaics`, ESM, Node.js ≥ 22.17) around
  [`jsdoc-to-markdown`](https://www.npmjs.com/package/jsdoc-to-markdown): one
  `.md` API doc per source file, generated from JSDoc — not one giant document.
- Every documented symbol carries a `src:` pointer (source line, relative to
  the workspace root) and a `dist:` pointer (line in the compiled output, via
  the sibling `.js.map`; 16 MB cap, inline-map support).
- `.ts` parameter and return types are resolved with the TypeScript compiler
  API (a snapshot of the truth at generation time); `.js` types come from the
  JSDoc annotations. Interfaces and type aliases are erased at compile time
  and are not documented.
- Vite-style `mdaics.config.js` (ESM, CommonJS or function config), validated
  with zod at the trust boundary — config, `process.env` and the on-disk
  cache. Unknown keys are rejected; `--config <path>` selects a different
  file. `--dry-run`, `--verbose`, `--parallelism` and `--no-cache` flags.
- Monorepo support via glob roots (`rootSrcDir: 'packages/*/src'`); each match
  gets its own `docs/` folder.
- Two-tier, content-addressed render cache at `<cwd>/.mdaicscache` (on by
  default; `cache: false` or `--no-cache` disables it; `cachePath`
  relocates it). Tier 1 caches finished markdown and skips everything
  including the TypeScript program; tier 2 caches raw jsdoc template data
  (skipping the jsdoc child) and still re-runs normalize/pointers/checker/dmd
  so pointer lines are always fresh. Failures are never cached; corrupt
  caches degrade to a miss; atomic write with mode `0600`.
- 100% statements/branches/functions/lines coverage gate over `src/`, an
  end-to-end CLI suite, and the generated `docs/` tracked in git as dogfood
  output.
- `jsdoc-to-markdown`'s own types are generated from source
  (`scripts/sync-jsdoc-to-markdown-types.mjs`).

### Changed

- Config defaults are applied by the zod schema at parse time; the single
  source for defaults is `DEFAULT_CONFIG` in `src/schema.ts`.
- A missing `dist/` folder (or an individual missing `dist/*.js`) omits the
  `dist:` line entirely and records a note instead: one stderr warning per
  project / one issue per file. Exit code is unchanged; a `(approx.)` marker
  is only emitted when the dist build exists but the source map is unusable.
- `jutilities` is a runtime dependency, imported via subpaths only.

### Fixed

- Fresh checkouts pass the end-to-end suite: the fixture `dist/` outputs are
  committed (they were previously git-ignored).

[1.0.0]: https://github.com/rayenboussayed/mdocs/releases/tag/v1.0.0
