# regular-repo-ts — line-number reference

Built with:

```
node <mdaics-root>/node_modules/typescript/bin/tsc -p tsconfig.json
```

(`rootDir: src`, `outDir: dist`, `target/module: es2022`, `sourceMap + declaration + declarationMap: true`, `removeComments: false`.)

JSDoc comments survive into `dist/*.js`, but tsc elides blank lines between
top-level declarations, so **dist line numbers drift lower than src** as you go
down a file. This is exactly what the committed `.js.map` files are for.

## src/math.ts vs dist/math.js

| symbol      | src line | dist line | drift |
|-------------|----------|-----------|-------|
| `add`       | 8        | 7         | -1    |
| `clamp`     | 19       | 17        | -2    |
| `first`     | 29       | 26        | -3    |
| `double` (undocumented, exported) | 35 | 31 | -4 |

## src/geometry.ts vs dist/geometry.js

| symbol   | src line | dist line | notes |
|----------|----------|-----------|-------|
| `Point` (class)        | 4  | 4 | constructor JSDoc at src 5-10 |
| `Shape` (interface)    | 27 | — | interfaces are erased from JS output; only `.d.ts` keeps it |
| `Vector2` (type alias) | 35 | — | erased from JS output |

## Other

- `src/broken.ts` has **no JSDoc at all** (must not crash / must produce an empty or minimal doc).
- `src/math.ts` line 35 `double` is exported but undocumented — fixture for graceful skip.
- First line of `src/math.ts` is intentionally blank to create non-zero drift for `add`.

Re-grep any time with:

```
grep -n "export function \|export class \|export interface \|export type " src/*.ts dist/*.js
```
