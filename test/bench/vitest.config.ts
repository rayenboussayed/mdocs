/**
 * Dedicated runner for the benchmark suites in this directory — used by
 * `npm run bench` (the `benchmark` project, files matching `*.bench.ts`) and
 * `npm run bench:memory` (`vitest run`, files matching `*.test.ts`).
 *
 * Kept outside the root vitest config deliberately: the root config's
 * `include` decides what `npm test` sees, and its 100% coverage gate must
 * never see these files. The benchmark project replaces `include` with
 * `benchmark.include`, so `latency.bench.ts` is picked up automatically;
 * `memory.test.ts` is matched by the regular `include` below.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: { enabled: false },
    environment: 'node',
    include: ['test/bench/**/*.test.ts'],
    // Only one suite file and no cross-file state to protect — skipping
    // per-file isolation just saves a fork for this diagnostic runner.
    // (Never set this in the root config: the e2e files mutate process.env.)
    isolate: false,
    testTimeout: 300_000,
  },
})
