# monorepo — line-number reference

Workspaces fixture. Each workspace builds its own `dist/` with the same
compilerOptions as `regular-repo-ts`, run from inside the package:

```
node <mdocs-root>/node_modules/typescript/bin/tsc -p packages/alpha/tsconfig.json
node <mdocs-root>/node_modules/typescript/bin/tsc -p packages/beta/tsconfig.json
```

Expected `mdocs.config.js` example for this fixture:

```js
export default defineConfig({
  rootSrcDir: ['packages/*/src'],
  rootDistDir: 'dist',        // resolved per workspace
  outDirName: 'docs',
})
```

## line numbers

| symbol              | file | src line | dist line | drift |
|---------------------|------|----------|-----------|-------|
| `double(n: number)` | packages/alpha/src/alpha.ts | 7  | packages/alpha/dist/alpha.js:6  | -1 |
| `shout(text)`       | packages/beta/src/beta.ts   | 7  | packages/beta/dist/beta.js:6    | -1 |

Re-grep with:

```
grep -n "export function " packages/*/src/*.ts packages/*/dist/*.js
```
