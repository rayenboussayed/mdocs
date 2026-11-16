# AGENTS.md — mdaics

Vite-style CLI + library around `jsdoc-to-markdown`: one `.md` API doc per source
file, with `src:`/`dist:` line pointers and TS-checker-resolved parameter types.
ESM only (`"type": "module"`), Node.js ≥ 22.17. Trust executable sources
(`package.json`, `tsconfig.json`, `vitest.config.ts`, the code) over prose.

## Commands

- `npm run check` — **the gate**: `typecheck` → `lint` → `knip` → `test`. husky's `pre-commit` runs it.
- `npm test` — clean-ish rebuild (`npm run build`) then `vitest run --coverage`. Enforces 100% statements/branches/functions/lines over `src/**/*.ts`.
- `npm run lint` — report-only (`eslint . --cache`); `npm run lint:fix` auto-fixes. `lint` in `check` must stay report-only — a check that rewrites sources is wrong.
- `npm run typecheck` — `tsc -p tsconfig.test.json` (checks src **including** colocated tests, plus test/e2e — `tsconfig.json` alone excludes them).
- `npm run build` — `tsc -p tsconfig.json` → `dist/`. `npm test` builds before its e2e tests spawn `dist/cli.js`; a stale `dist/` tests the wrong binary.
- `npm run clean` — removes `dist/` and `.test-dist/`. `prepack` = clean + build; `prepublishOnly` = clean + check.
- No `npm run docs` — dogfooding is `node dist/cli.js` from the repo root (writes `docs/`, which is tracked generated output).
- Focused tests: `npx vitest run -t '<name>'`. The 100% gate only holds under `npm test`.
- `npm run bench` — latency benchmarks (vitest bench, informational, not gated). `npm run bench:memory` — memory scenarios with printed report; corpus: `MDAICS_BENCH_FILES` (default 120).

## Layout

- Entry points: `src/cli.ts` (commander bin → `dist/cli.js`), `src/index.ts` (library API).
- Unit tests are colocated: `src/<name>.test.ts` (vitest).
- E2E tests live in `test/e2e/`; they copy `test/fixtures/*` to `mkdtemp` (never touch fixtures in place) and call `run()` / spawn `dist/cli.js`.
- `test/*.test.ts` top-level files are inert `export {}` "moved to …" stubs; `test/fixtures/**` contains intentionally broken sample inputs — both are excluded from lint and from vitest. They do nothing — leave them, deletions are blocked.
- `src/test-utils.ts` is test-only (`expectMdaicsError` + `writeUtf8`/`readUtf8`/`mkdirp`), excluded from build and coverage. fs paths in tests go through these wrappers, which carry the one justified inline eslint-disable each.
- `docs/` is generated dogfood output, tracked in git, not hand-maintained. Regenerate after any `src/` edit with pointer drift and commit the result alongside the edit (`node dist/cli.js`).

## Non-obvious pipeline facts

- jsdoc cannot parse TypeScript, so `.ts` sources are transpiled **in memory**
  (`ts.transpileModule`) into a `mkdtemp` scratch dir for jsdoc, and lines are
  mapped back via sourcemaps (`@jridgewell/trace-mapping`). `.ts` parameter/
  return types come from the TS checker index (`tscheck.ts`), never from the
  JSDoc comment; JSDoc wins only when the checker says `any`.
- `src:`/`dist:` pointers are relative to the run's `cwd` (the workspace root), not absolute and not package-root-relative.
- Validation is centralized in `src/schema.ts` (zod, `strictObject`) — the single trust boundary for config, `process.env` and the on-disk cache. **Do not re-add redundant guards** in `run.ts`/`render.ts`/`resolve.ts`/`pool.ts`/`cache.ts`; earlier defensive re-checks were removed on purpose.
- Unreachable-by-design code is allowed but must carry a justified `/* v8 ignore ... */` comment; never weaken the 100% thresholds in `vitest.config.ts`.
- `console.warn` is swallowed only inside the dmd render section, which is serialized through a promise gate (`withWarnSunk`) — pool workers must not race the patch. Other dmd warnings (`getTemplateData`) are NOT sunk.
- `run()` deletes `JSDOC_PATH` from `process.env`; env access goes through `parseProcessEnv` only (invalid values silently fall back to defaults — `NODE_ENV` selects the function-form config's `mode`, `MDAICS_DEBUG=1` enables stack traces, `NO_COLOR` is accepted but unused).
- `dist:` pointers are exact only when the committed `.js.map` matches the source; otherwise `(approx.)` — except when the dist file itself is missing, in which case the `dist:` line is omitted (one per-file note), and when the whole dist folder is missing, in which case every project emits no `dist:` lines (one stderr warning + one `(dist)` issue per project). Sibling `.map` reads are capped at 16 MB; inline maps are read from the last 64 KB only.
- tsconfig is stricter than defaults: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`, `nodenext`.
- Config load errors are wrapped in `CONFIG_LOAD_FAILED` in `loadConfig` (one choke point); loader details live in `importConfigModule`/`importEsmInCommonJsPackage`.
- `cache` (default `true`) and `cachePath` (default `.mdaicscache`) drive the mdaics-owned, content-addressed render cache. It is a local speedup and it is committed in this repo (warm CI on an unchanged tree); `.gitignore` excludes only `.mdaicscache.tmp-*` write artifacts. Two tiers: the raw `getTemplateData()` output (skips the jsdoc child) and the finished markdown (skips everything, including the TS program). `--no-cache` disables it for one run; `cache: false` disables it in config. Regenerate it with `node dist/cli.js` — it churns whenever output-affecting inputs change.
- The cache is read at run start and written once at run end (tmp file + atomic rename, mode `0600`). Corrupt or unreadable files are a miss, never a hard error. Cache keys are cwd-relative posix paths; content fingerprints cover source text + TS program + dist map + toolchain versions.

## Lint & doc style

- ESLint flat config with `recommended-natural` ordering (value-builtin imports may precede `node:` ids), `recommended-tsdoc` for TS, `@vitest/eslint-plugin` on test files only.
- JSDoc on every function/method/class: `@param name - description` **required** (the linter enforces presence). `@returns` required only for non-`void` functions — void functions must NOT have `@returns` (`require-returns-check` fails the other way).
- `{@link}` is never used in doc comments — per-file generated docs make intra-file links dead; write the symbol name in backticks instead.
- **Never disable a rule globally in `eslint.config.js`.** Inline `// eslint-disable-next-line <rule> -- <reason>` next to the site is the only sanctioned form, always with a written justification (touching security/detect-* fs rules or test files).
- `eslint --fix` may rewrite layout (import order, object key order). **`src/cli.ts` deliberately has no shebang** — `n/hashbang` deletes it (the bin path is `dist/cli.js`, not this file), so the build injects `#!/usr/bin/env node` into `dist/cli.js` after `tsc` and `test/e2e/cli.test.ts` asserts it is there. Never "restore" the shebang into the source — npm bins come from `dist/` only.
- Test fixtures (`test/fixtures/**`) are CLI inputs, never valid code — they are ignored by lint and must stay byte-identical.

## Repo state / release gotchas

- **Git repository; no CI.** Local `npm test` / `npm run check` is the only gate — do not claim anything is verified without running them. husky hooks are live (`pre-commit` = `npm run check`, `commit-msg` = commitlint); `prepare` uses `husky || true` so installs never fail outside git.
- **Publishing is governed by `.npmignore`, not a `files` field** (deliberate design decision, see the commit that introduced it). Any root-level file added later **ships in the tarball** unless it is excluded in `.npmignore` — always verify with `npm pack --dry-run` after adding root-level files. `docs/`, `.mdaicscache`, `coverage/`, `src/`, `test/` are all excluded on purpose; re-check they stay excluded.
- The package is named `mdaics` (npm-verified free). The earlier name `mdocs` is permanently held by npm's deprecation holder; `mdaics` is the rename target. LICENSE says "the mdaics contributors". No `repository`/`bugs` in `package.json` yet. Name/LICENSE/repository decisions block publishing.
- `typescript` is a **runtime** dependency (the TS checker is used on every run); `jutilities`
  is one too, imported via subpaths only (`jutilities/hof/*`, `jutilities/node/fs/dir`, `jutilities/to`),
  never the root — it is ESM-only with no barrel, and `hof/cache` (ExpiredMap singleton) must
  never be imported. `jsdoc-api` is not a dependency — it arrives via `jsdoc-to-markdown`.
  Key helpers stay local on purpose: `withWarnSunk` (serializes the `console.warn` patch through
  a promise gate), `walkFiles` (dotfile/`node_modules` ignore rules, unreadable directories noted
  and skipped), `mapPool` (order-preserving, abort-on-first-throw).
- `mdaics.config.js` is executable code run in-process (like vite's) — keep that trust model in mind for config-related changes; never add JSDoc_PATH-style relocations or network access.
- Update `CHANGELOG.md` in the same change as any user-visible change (new flags/config/keys, output or pointer-format changes, dependency or Node-requirement changes). One `## [x.y.z] - YYYY-MM-DD` section per release (Keep a Changelog format); cut releases with `npm version`.
- 100% coverage claims are only meaningful under `npm test` (build + run). Deleting `test/*.test.ts` stubs is blocked — they are excluded, not fixed.
