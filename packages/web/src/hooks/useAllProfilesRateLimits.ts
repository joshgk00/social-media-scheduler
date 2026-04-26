// Re-export the real implementation from `use-rate-limit.ts` so the Plan 01
// RED test (which mocks `'../hooks/useAllProfilesRateLimits'`) and any future
// import resolve to the same hook. Keeping the dedicated module path means
// the test's `vi.mock('../hooks/useAllProfilesRateLimits', ...)` continues
// to swap exactly the mocked surface.
export { useAllProfilesRateLimits } from './use-rate-limit';
