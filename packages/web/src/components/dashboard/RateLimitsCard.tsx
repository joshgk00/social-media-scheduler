import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { useAllProfilesRateLimits } from '../../hooks/useAllProfilesRateLimits';
import { formatResetTime } from '../../lib/format-reset-time';

// LIMIT-08 — `/dashboard` rate-limit widget. UI-SPEC §"Dashboard Rate-Limit
// Card" defines the layout: shadcn Table with Profile · Usage · Resets
// columns, color-banded progress bar (green < 50%, yellow 50-80%, red > 80%),
// platform icon in the profile cell, and relative + absolute reset-time copy.
//
// The Plan 01 RED test (`__tests__/RateLimitsCard.test.tsx`) is the binding
// contract for this component:
//   - data is consumed as a flat `RateLimitState[]` (the hook's select() flat-
//     tens `{ profiles: [...] }` for us).
//   - color bands are exposed via `data-band="green|yellow|red"` and an
//     accessible label `usage band: {color}` so the test can find them.
//   - the progress bar carries `role="progressbar"` + `aria-valuenow` (used
//     count) + `aria-valuemax` (limit) + `aria-label="{platform} rate limit
//     usage"`.
//   - skeleton rows expose `role="status"` + `aria-label="loading rate
//     limits"` so `getAllByRole('status', { name: /loading rate limits/i })`
//     resolves.

type Band = 'green' | 'yellow' | 'red';

function resolveBand(percent: number): Band {
  if (percent > 80) return 'red';
  if (percent >= 50) return 'yellow';
  return 'green';
}

const BAND_BAR_CLASS: Record<Band, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-destructive',
};

const BAND_DOT_CLASS: Record<Band, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-destructive',
};

// lucide-react 1.7 (current pinned version) does not ship the Twitter /
// Linkedin / Facebook brand icons — Plan 05a uses letter-badge fallbacks in
// ProfilePicker for the same reason. Mirror that pattern here so the
// dashboard widget has a visual cue per platform without depending on icon
// availability.
const PLATFORM_LETTER: Record<'twitter' | 'linkedin' | 'facebook', string> = {
  twitter: 'X',
  linkedin: 'in',
  facebook: 'f',
};

function PlatformBadge({
  platform,
}: {
  platform: 'twitter' | 'linkedin' | 'facebook';
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-secondary text-[0.625rem] font-semibold text-secondary-foreground"
    >
      {PLATFORM_LETTER[platform]}
    </span>
  );
}

// The Plan 01 stub mocks rows with `budget` (not `limit`) for every platform.
// The real Plan 03 collection endpoint emits `limit` for LinkedIn/Facebook
// and `budget` for Twitter. Read whichever the row carries.
interface RateLimitRow {
  profileId: string;
  platform: 'twitter' | 'linkedin' | 'facebook';
  handle?: string;
  currentCount: number;
  budget?: number;
  limit?: number;
  windowResetAt?: string;
  monthStartUtc?: string;
}

function readLimit(row: RateLimitRow): number {
  return row.limit ?? row.budget ?? 0;
}

export function RateLimitsCard() {
  const { data, isLoading, isError } = useAllProfilesRateLimits() as {
    data: RateLimitRow[] | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rate Limits</CardTitle>
        </CardHeader>
        <CardContent>
          {[0, 1, 2].map((i) => (
            <Skeleton
              key={i}
              role="status"
              aria-label="Loading rate limits"
              className="h-10 mb-2"
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rate Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Couldn&apos;t load rate limits.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rate Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-center text-muted-foreground">
            No connected profiles yet.
          </p>
          <p className="text-sm text-center mt-1">
            {/*
              Plain anchor (not <Link>) so the empty state renders without a
              Router context — the Plan 01 RED test renders the component
              under QueryClientProvider only.
            */}
            <a
              href="/profiles"
              className="text-primary underline-offset-4 hover:underline"
            >
              Connect a profile
            </a>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rate Limits</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profile</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Resets</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const limit = readLimit(row);
              const percent =
                limit > 0 ? Math.round((row.currentCount / limit) * 100) : 0;
              const band = resolveBand(percent);
              // Issue #35: every platform (including Twitter) must display
              // the FUTURE reset boundary. Previously the Twitter row read
              // `monthStartUtc` (start of the current window — always in the
              // past) and rendered a stale "Resets Mar 31". Route the Twitter
              // row through `formatResetTime` on `windowResetAt` (= start of
              // next UTC month) like the other platforms.
              const reset = row.windowResetAt
                ? formatResetTime(row.windowResetAt, row.platform)
                : { relative: '', absolute: '' };

              const profileLabel = row.handle ?? row.profileId.slice(0, 8);

              return (
                <TableRow key={row.profileId}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <PlatformBadge platform={row.platform} />
                      <span className="text-sm font-semibold">
                        {profileLabel}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {/*
                      Band dot is a sibling of the progressbar inside this
                      flex container so the Plan 01 RED test query
                      `bar.parentElement.querySelector('[data-band="green"]')`
                      resolves. `aria-label` on the dot also satisfies the
                      `getByLabelText(/usage band: yellow|red/i)` queries.
                    */}
                    <div className="flex items-center gap-2">
                      <span
                        data-band={band}
                        aria-label={`Usage band: ${band}`}
                        className={`inline-block h-2 w-2 rounded-full shrink-0 ${BAND_DOT_CLASS[band]}`}
                      />
                      <div
                        role="progressbar"
                        aria-valuenow={row.currentCount}
                        aria-valuemax={limit}
                        aria-label={`${row.platform} rate limit usage`}
                        className="h-2 rounded-full bg-secondary w-full max-w-[200px] overflow-hidden"
                      >
                        <div
                          className={`h-2 rounded-full ${BAND_BAR_CLASS[band]}`}
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.currentCount}/{limit} ({percent}%)
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {reset.relative ? (
                      <>
                        <span>{`Resets in ${reset.relative}`}</span>
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          ({reset.absolute})
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Resets {reset.absolute}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
