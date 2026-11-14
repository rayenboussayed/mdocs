# AGENTS.md — mdocs

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
- No `npm run docs` — dogfooding is `node dist/cli.js` from the repo root (writes `docs/`, which is gitignored generated output).
- Focused tests: `npx vitest run -t '<name>'`. The 100% gate only holds under `npm test`.
- `npm run bench` — latency benchmarks (vitest bench, informational, not gated). `npm run bench:memory` — memory scenarios with printed report; corpus: `MDOCS_BENCH_FILES` (default 120).

## Layout

- Entry points: `src/cli.ts` (commander bin → `dist/cli.js`), `src/index.ts` (library API).
- Unit tests are colocated: `src/<name>.test.ts` (vitest).
- E2E tests live in `test/e2e/`; they copy `test/fixtures/*` to `mkdtemp` (never touch fixtures in place) and call `run()` / spawn `dist/cli.js`.
- `test/*.test.ts` top-level files are inert `export {}` "moved to …" stubs; `test/fixtures/**` contains intentionally broken sample inputs — both are excluded from lint and from vitest. They do nothing — leave them, deletions are blocked.
- `src/test-utils.ts` is test-only (`expectMdocsError` + `writeUtf8`/`readUtf8`/`mkdirp`), excluded from build and coverage. fs paths in tests go through these wrappers, which carry the one justified inline eslint-disable each.
- `docs/` is generated dogfood output (gitignored), not hand-maintained. Regenerate after any `src/` edit with pointer drift (`node dist/cli.js`).

## Non-obvious pipeline facts

- jsdoc cannot parse TypeScript, so `.ts` sources are transpiled **in memory**
  (`ts.transpileModule`) into a `mkdtemp` scratch dir for jsdoc, and lines are
  mapped back via sourcemaps (`@jridgewell/trace-mapping`). `.ts` parameter/
  return types come from the TS checker index (`tscheck.ts`), never from the
  JSDoc comment; JSDoc wins only when the checker says `any`.
- `src:`/`dist:` pointers are relative to the run's `cwd` (the workspace root), not absolute and not package-root-relative.
- Validation is centralized in `src/schema.ts` (zod, `strictObject`) — the single trust boundary for config and `process.env`. **Do not re-add redundant guards** in `run.ts`/`render.ts`/`resolve.ts`/`pool.ts`; earlier defensive re-checks were removed on purpose.
- Unreachable-by-design code is allowed but must carry a justified `/* v8 ignore ... */` comment; never weaken the 100% thresholds in `vitest.config.ts`.
- `console.warn` is swallowed only inside the dmd render section, which is serialized through a promise gate (`withWarnSunk`) — pool workers must not race the patch. Other dmd warnings (`getTemplateData`) are NOT sunk.
- `run()` deletes `JSDOC_PATH` from `process.env`; env access goes through `parseProcessEnv` only (invalid values silently fall back to defaults — `NODE_ENV` selects the function-form config's `mode`, `MDOCS_DEBUG=1` enables stack traces, `NO_COLOR` is accepted but unused).
- `dist:` pointers are exact only when the committed `.js.map` matches the source; otherwise `(approx.)`. Sibling `.map` reads are capped at 16 MB; inline maps are read from the last 64 KB only.
- tsconfig is stricter than defaults: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`, `nodenext`.
- Config load errors are wrapped in `CONFIG_LOAD_FAILED` in `loadConfig` (one choke point); loader details live in `importConfigModule`/`importEsmInCommonJsPackage`.

## Lint & doc style

- ESLint flat config with `recommended-natural` ordering (value-builtin imports may precede `node:` ids), `recommended-tsdoc` for TS, `@vitest/eslint-plugin` on test files only.
- JSDoc on every function/method/class: `@param name - description` **required** (the linter enforces presence). `@returns` required only for non-`void` functions — void functions must NOT have `@returns` (`require-returns-check` fails the other way).
- `{@link}` is never used in doc comments — per-file generated docs make intra-file links dead; write the symbol name in backticks instead.
- **Never disable a rule globally in `eslint.config.js`.** Inline `// eslint-disable-next-line <rule> -- <reason>` next to the site is the only sanctioned form, always with a written justification (touching security/detect-* fs rules or test files).
- `eslint --fix` may rewrite layout (import order, object key order). **`src/cli.ts` deliberately has no shebang** — `n/hashbang` deletes it (the bin path is `dist/cli.js`, not this file), so the build injects `#!/usr/bin/env node` into `dist/cli.js` after `tsc` and `test/e2e/cli.test.ts` asserts it is there. Never "restore" the shebang into the source — npm bins come from `dist/` only.
- Test fixtures (`test/fixtures/**`) are CLI inputs, never valid code — they are ignored by lint and must stay byte-identical.

## Repo state / release gotchas

- **Not a git repository; no CI.** Local `npm test` / `npm run check` is the only gate — do not claim anything is verified without running them. husky hooks (`pre-commit` = `npm run check`, `commit-msg` = commitlint) activate only once this becomes a git repo; `prepare` uses `husky || true` so installs never fail outside git.
- The npm name `mdocs` is taken/deprecated/unclaimable; `mdocs-cli` was verified free but not yet decided. LICENSE says "the mdocs contributors". No `repository`/`bugs` in `package.json` yet. Name/LICENSE/repository decisions block publishing.
- `typescript` is a **runtime** dependency (the TS checker is used on every run); `jsdoc-api` is not a dependency — it arrives via `jsdoc-to-markdown`.
- `mdocs.config.js` is executable code run in-process (like vite's) — keep that trust model in mind for config-related changes; never add JSDoc_PATH-style relocations or network access.
- 100% coverage claims are only meaningful under `npm test` (build + run). Deleting `test/*.test.ts` stubs is blocked — they are excluded, not fixed.
