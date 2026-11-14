# Benchmark suite

Informational latency and memory benchmarks for mdocs's hot paths. They exist so a
human comparing two runs on the same machine can see regressions in the
resolve → tscheck → render pipeline. They are **not** part of `npm test`,
`npm run check`, or the coverage gate, and they never assert a timing or memory
threshold — numbers are machine-dependent.

Same-machine A/B only — never compare absolute numbers across machines, never read a pass/fail signal into a number. Structural assertions (finite values, `result.failed` empty, corpus cleanup) are the only hard checks. `test/fixtures/**` is read-only everywhere in this suite.

## Run

```sh
npm run bench          # latency benchmarks (tinybench via `vitest bench`, verbose reporter, tables inline)
npm run bench:memory   # memory scenarios (sets NODE_OPTIONS=--expose-gc so heap numbers mean something)
```

Both print an environment fingerprint (node, platform/arch, CPU model/count, `NODE_OPTIONS`, `MDOCS_BENCH_FILES`) as the first line — always read it before the table. `npm run bench` accepts a filter: `npm run bench -- lookupSymbol`. `bench:memory` prints the fingerprint, a worker-floor line, a results table (`scenario | rssΔ MB | heapΔ MB | maxRSS@end MB | dur s`) and a caveats footer.

## What is measured

### Latency — `latency.bench.ts`

| Bench | What it measures |
| --- | --- |
| `createTypeProgram` (3 fixture files) | Fixed overhead of the shared TS program |
| `collectSourceFiles` (corpus) | fs walk over the synthetic corpus |
| `createLineMapper` (fixture `.js.map`) | Source-map parsing |
| `readFileSourceMap` (fixture) | Sibling `.js.map` fast path |
| `injectCheckerTypes` (3 doclets, shared program) | Per-doclet checker enrichment |
| `lookupSymbol x1000` (batch) | The per-doclet lookup, batched ×1000 |
| `mapPool` (2000 no-op tasks, limit 8) | Scheduler overhead baseline |
| `normalizeDoclets + injectPointers` (3 doclets) | Per-doclet pointer injection |
| `run({ dryRun: true })` | Macro bench: the full plan without jsdoc |

Benches import from `src/` directly (no stale `dist/` risk). vitest's module
runner wraps every import binding in a getter, so sub-microsecond benches bind
their hot imports locally — the documented mitigation for getting meaningful
timings at that scale.

### Memory — `memory.test.ts`

| Scenario | What it measures |
| --- | --- |
| A. Baseline after imports | Worker floor |
| B. `createTypeProgram` over 20 corpus files | Retained delta after GC |
| C. Full `run()` over the corpus | Parent-side footprint; spawns one jsdoc child per file (children are invisible to `memoryUsage()`) |
| D. Retained heap across 5 `collectSourceFiles` passes | Leak smoke, informational only |

Scenario C runs with `parallelism: 8`: at the default (all cores) jsdoc grandchildren transiently fail with EAGAIN-style errors on saturated machines; the parent-side footprint is queue-dominated, not child-count-dominated, so 8 concurrent children measures the same thing without the flakiness.

## Reading the memory numbers

- `maxRSS` is cumulative since process start (a high-water mark) — it is never a
  per-scenario peak. Only the end value is reported.
- `heapUsed` after GC is a **lower bound**; ±5–15 MB run-to-run noise is expected.
- Scenario C covers the **parent worker only**. jsdoc children are invisible to
  the parent's `memoryUsage()`.
- All numbers are informational. No absolute megabyte figure is asserted anywhere.

## The synthetic corpus

Both suites generate a deterministic (no randomness), JSDoc-heavy TypeScript corpus into a `mkdtemp` directory under `<tmpdir>/mdocs-bench-*` (mode `0700`, files `0600`), with a `src/sample-NNNN.ts` layout, ~44 lines per file and ≈7 doclets each. It is torn down after every run — never committed, never dogfooded, and it contains no `mdocs.config.js` by design.

Corpus size defaults to 120 files and is controlled by `MDOCS_BENCH_FILES`
(integer 1–1024):

```sh
MDOCS_BENCH_FILES=24 npm run bench:memory
```

The corpus is regenerated automatically on every run; there is nothing to
regenerate by hand.

## Environment variables

| Variable | Effect |
| --- | --- |
| `MDOCS_BENCH_FILES` | Corpus size, integer 1–1024 (default 120). Invalid values throw `RangeError`. |
| `NODE_OPTIONS=--expose-gc` | Required for meaningful heap numbers in `bench:memory` (the npm script sets it). Without it, `settle()` is a no-op yield. |

## Example output (reference machine only)

Absolute numbers are machine-dependent; the following are examples from one
machine (i7-11800H, node v24.18.0, linux-x64), **not** targets or guarantees:

- `createTypeProgram` ~2250 ms (4 iterations)
- `collectSourceFiles` ~1.3 s
- `run({ dryRun: true })` macro ~1.25 s/op
- `injectCheckerTypes` ~96k ops/s
- `lookupSymbol` ~381 batch/s (×1000 per batch)
- `mapPool` ~4577 ops/s
- `normalizeDoclets + injectPointers` ~2.2M ops/s
- Memory: B ≈ +121 MB maxRSS retained for the program; C ≈ +140…162 MB RSS but
  only +7 MB heap; worker floor ≈ 125 MB

## Caveats

- Not gated, not in CI, not in `npm run check` — and not meant to be.
- Results vary with OS load, CPU frequency scaling and node version; re-run
  before drawing conclusions.
- Scenario C is queue-dominated and includes child spawn overhead; it is not a model of peak jsdoc child memory.

## Maintenance notes

- `test/fixtures/**` (program-creation and sourcemap benches) is read-only everywhere in this suite — copy it to a `mkdtemp` directory if a bench ever needs to write.
- Lint, typecheck and knip all cover `test/bench/**`; `knip.json` carries `"entry": ["test/bench/**/*.ts"]` so the bench files are not reported as unused. Do not remove that entry.
- The corpus is generated by `helpers.ts`; edit `TEMPLATE` there if the pipeline
  gains a shape worth benchmarking. Keep it deterministic — no randomness.
- Do not add thresholds or assertions on measured values; the suites' only hard checks are structural (finite, monotonic maxRSS, `result.failed` empty, corpus teardown).

## Deeper profiling (ad hoc, not committed)

The fast knobs are already set (`--reporter=verbose`, `NODE_COMPILE_CACHE`,
`isolate: false` for this config only). For a real profile of the suite:

```sh
vitest run --config test/bench/vitest.config.ts --experimental.importDurations.print
NODE_OPTIONS=--expose-gc vitest run --config test/bench/vitest.config.ts \
  --execArgv=--cpu-prof --execArgv=--cpu-prof-dir=.bench-profile
```

Then inspect `.bench-profile/*.cpuprofile` (speedscope / Chrome DevTools / VS Code).
`--execArgv` passes Node flags straight to the worker; the directory is
disposable. See vitest's profiling guide for the main-thread variant. The
numbers worth trusting are the tinybench rows; everything here exists to find
unexpected import/transform cost.

NODE_COMPILE_CACHE is set by both scripts — it only pays off on repeat runs,
reuses bytecode in `node_modules/.cache/node-compile-cache` (already gitignored),
and is deliberately NOT set for `npm test`, where v8 coverage disables it anyway.
