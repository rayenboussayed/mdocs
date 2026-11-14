/**
 * Vitest configuration: unit tests live next to the source they test
 * (`src/<name>.test.ts`); end-to-end suites live in `test/e2e/` and spawn
 * the compiled CLI / call `run()` against fixture copies. Coverage is
 * enforced at 100% for every file that is counted — the CLI entry is
 * excluded because it is exercised end-to-end by spawning it as a child
 * process, which in-process coverage cannot observe.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/e2e/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        // Test-only assertion helpers (see src/test-utils.ts).
        'src/test-utils.ts',
        // Binary entry: exercised by the spawn-based e2e tests, not importable in-process.
        'src/cli.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
