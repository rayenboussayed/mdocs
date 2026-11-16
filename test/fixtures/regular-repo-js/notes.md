# regular-repo-js — line-number reference

Plain-JS fixture, ESM. `dist/` is produced by the same toolchain a JS-using
consumer would use:

```
node <mdaics-root>/node_modules/typescript/bin/tsc -p tsconfig.json
```

(`allowJs: true`, `checkJs: false`, `sourceMap + declaration + declarationMap: true`,
`target/module: es2022`, `removeComments: false`.) JSDoc is preserved verbatim in
`dist/index.js`; the leading blank line of `src/index.js` plus blank-line elision
give a small but real src→dist drift.

## src/index.js vs dist/index.js

| symbol            | src line | dist line | drift |
|-------------------|----------|-----------|-------|
| `greet(name)`     | 9        | 8         | -1    |
| `sum(list, start)`| 21       | 19        | -2    |
| `Counter` (class) | 28       | 25        | -3    |
| `Counter.increment` | 42     | 38        | -4    |

Re-grep with:

```
grep -n "export function \|export class " src/index.js dist/index.js
```
