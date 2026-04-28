// Aggregate barrel for `lib/` modules. The root barrel (`src/index.ts`) still
// re-exports each lib file individually because it predates this aggregate;
// new consumers can import from `@sms/shared` (which re-exports the same
// surface) or from the per-file path. This file exists so the lib directory
// has a stable single entry-point if downstream callers prefer it.
export * from './error-classifier.js';
export * from './schedule-evaluation.js';
export * from './spinnable-text.js';
export * from './platform-text-limits.js';
