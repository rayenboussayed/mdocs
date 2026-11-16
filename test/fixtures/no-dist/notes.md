# no-dist — line-number reference

Deliberately has **no `dist/` folder at all** (do not build it). Tests should
assert that docs still generate and that the `dist:` line is **omitted** — only
the `src:` pointer is emitted — with one `mdaics: warning: dist folder not
found: …` on stderr and one `(dist)` issue per run.

## line numbers

| symbol                  | file           | src line | dist line |
|-------------------------|----------------|----------|-----------|
| `identity<T>(x: T): T`  | src/lone.ts    | 8        | n/a (omitted — no dist/) |

Re-grep with:

```
grep -n "export function identity" src/lone.ts
```
