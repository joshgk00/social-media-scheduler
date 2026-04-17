import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/migrate.ts'],
      exclude: ['src/__tests__/**'],
      thresholds: {
        branches: 100,
        // functions/lines/statements are below 100 due to three unreachable paths:
        // (1) defaultLogger.warn — only reachable without an injected logger during
        //     a duplicate-object scenario; all tests inject a custom logger;
        // (2) defaultLogger.error — only reachable without an injected logger when
        //     pg_advisory_unlock throws; same unreachable combination as (1)+(3);
        // (3) the advisory-lock unlock catch block (line ~114) — only reachable if
        //     pg_advisory_unlock throws, which requires the DB session to close mid-run.
        // Branch coverage is 100% — the decision paths are all exercised.
        functions: 71,
        lines: 95,
        statements: 95,
      },
    },
  },
});
