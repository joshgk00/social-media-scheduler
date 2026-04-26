/**
 * Stub for Plan 05b. The real hook ships in
 * `08-05b-dashboard-and-rate-limit-chip`. This stub exists only so the
 * Plan 01 RED test that mocks this module compiles under `tsc -b`.
 */
export function useAllProfilesRateLimits(): {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
} {
  return { data: undefined, isLoading: true, isError: false };
}
