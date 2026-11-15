# test/fixtures — summary for the test author

All fixtures are copied to `os.tmpdir()` before the CLI runs, so assume the
fixture tree gets polluted; regenerate `dist/` if a test needs a clean build
(see each fixture's notes.md for the exact tsc command). No `node_modules` is
committed anywhere here — tests resolve deps from the mdocs root.

## fixtures

| fixture | shape | purpose |
|---|---|---|
| `regular-repo-ts/` | src + pre-built dist (js/js.map/d.ts/d.ts.map) | TS happy path: generics (`first<T>`), default params (`clamp`), class + interface + type alias (`geometry.ts`), JSDoc with @param/@returns, exported-but-undocumented symbol (`double`), zero-JSDoc file (`broken.ts`), real src→dist line drift |
| `regular-repo-js/` | src + dist built via `allowJs` tsc | plain JS + JSDoc `{number}` types, @example, defaults, ESM class `Counter` |
| `monorepo/` | `packages/{alpha,beta}` each with own tsconfig + dist | workspaces glob `rootSrcDir: ['packages/*/src']` |
| `no-dist/` | src only, **no dist** | docs must still generate; dist line omitted; one stderr warning + one issue |
| `seeded-bad/` | **skipped** | a CRLF-file fixture was considered but skipped to keep size down — if the test author needs one, add `src/tricky/crlf.ts` with CRLF line endings (a one-liner: `printf 'export function f() {\r\n  return 1\r\n}\r\n' > src/tricky/crlf.ts`) |

## line-drift facts (verified by grep -n)

- `regular-repo-ts`: `add` src:8 → dist:7, `clamp` src:19 → dist:17, `first` src:29 → dist:26.
  Drift is caused by tsc eliding blank lines between top-level declarations while
  preserving comments (`removeComments: false`). `.js.map` files are committed so
  source-map lookups are testable.
- `regular-repo-js`: `greet` src:9 → dist:8, `sum` src:21 → dist:19, `Counter` src:28 → dist:25.
- `monorepo`: `double` src:7 → dist:6, `shout` src:7 → dist:6.
- `no-dist`: `identity` src:8, no dist.

Total fixture size: ~17 KB (limit 40 KB).
