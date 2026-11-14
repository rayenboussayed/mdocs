# no-dist — line-number reference

Deliberately has **no `dist/` folder at all** (do not build it). Tests should
assert that docs still generate and that the dist location line is marked
`(approx.)` — e.g. `dist: src/lone.ts:8 (approx.)`.

## line numbers

| symbol                  | file           | src line | dist line |
|-------------------------|----------------|----------|-----------|
| `identity<T>(x: T): T`  | src/lone.ts    | 8        | n/a (approx.) |

Re-grep with:

```
grep -n "export function identity" src/lone.ts
```
