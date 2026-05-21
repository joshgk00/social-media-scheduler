import { DateTime } from 'luxon';
import { sql, type SQLWrapper } from 'drizzle-orm';

export interface RateLimitDb {
  execute(query: SQLWrapper | string): PromiseLike<ReadonlyArray<Record<string, unknown>>>;
}

// D-21: the monthly tweet counter is the count of posts transitioned into
// any "has-been-published" state this UTC calendar month.
const COUNTED_STATUSES = ['published', 'auto_destructing', 'destroyed'] as const;

const COUNTED_STATUSES_SQL = sql.join(
  COUNTED_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

const DEFAULT_WARN_THRESHOLD_PERCENT = 80;

export interface UsageSnapshot {
  currentUsage: number;
  monthlyBudget: number;
  warnThresholdPercent: number;
  monthStartUtc: Date;
  /**
   * Start of the NEXT UTC calendar month - the moment the Twitter monthly
   * budget resets.
   */
  monthResetAtUtc: Date;
}

export interface PlatformWindowSnapshot {
  currentCount: number;
  limit: number;
  warnThresholdPercent: number;
  windowStartUtc: Date;
  windowResetAt: Date;
}

interface TwitterProfileRow extends Record<string, unknown> {
  monthlyBudget: number;
  warnThresholdPercent: number;
}

interface TwitterCountRow extends Record<string, unknown> {
  publishedCount: number;
}

interface PlatformWindowRow extends Record<string, unknown> {
  limit: number;
  count: number;
  windowStart: Date | null;
  warnThresholdPercent: number | null;
}

async function executeRows<TRow extends Record<string, unknown>>(
  db: RateLimitDb,
  query: SQLWrapper,
): Promise<TRow[]> {
  return Array.from((await db.execute(query)) as ReadonlyArray<TRow>);
}

function utcDayStart(now: Date): Date {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
}

function utcNextDayStart(now: Date): Date {
  const next = utcDayStart(now);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function rollingHourThreshold(now: Date): Date {
  return new Date(now.getTime() - 60 * 60 * 1000);
}

function nextHourTop(now: Date): Date {
  const top = new Date(now);
  top.setUTCMinutes(0, 0, 0);
  top.setUTCHours(top.getUTCHours() + 1);
  return top;
}

function toPgTimestamptz(value: Date): string {
  return value.toISOString();
}

/**
 * Load the live monthly usage counter for a single Twitter profile.
 *
 * `now` is injectable for deterministic unit tests; when omitted we read
 * the clock via Luxon so existing tests that pin `Settings.now` keep working.
 */
export async function loadTwitterUsage(
  db: RateLimitDb,
  profileId: string,
  now?: Date,
): Promise<UsageSnapshot> {
  const nowUtc =
    now === undefined
      ? DateTime.utc()
      : DateTime.fromJSDate(now, { zone: 'utc' });
  const monthStart = nowUtc.startOf('month');
  const monthStartUtc = monthStart.toJSDate();
  const monthStartPg = toPgTimestamptz(monthStartUtc);
  const monthResetAtUtc = monthStart.plus({ months: 1 }).toJSDate();

  const [profileRow] = await executeRows<TwitterProfileRow>(
    db,
    sql`
      select
        monthly_tweet_budget as "monthlyBudget",
        warn_threshold_percent as "warnThresholdPercent"
      from social_profiles
      where id = ${profileId}
    `,
  );

  if (!profileRow) {
    throw new Error(`Profile ${profileId} not found`);
  }

  const [countRow] = await executeRows<TwitterCountRow>(
    db,
    sql`
      select count(*)::int as "publishedCount"
      from posts
      where profile_id = ${profileId}
        and published_at >= ${monthStartPg}::timestamptz
        and status in (${COUNTED_STATUSES_SQL})
    `,
  );

  return {
    currentUsage: Number(countRow?.publishedCount ?? 0),
    monthlyBudget: profileRow.monthlyBudget,
    warnThresholdPercent: profileRow.warnThresholdPercent,
    monthStartUtc,
    monthResetAtUtc,
  };
}

/**
 * LinkedIn daily-window loader (LIMIT-07). Returns the effective snapshot
 * after applying the UTC-midnight reset rule.
 */
export async function loadLinkedInWindowUsage(
  db: RateLimitDb,
  profileId: string,
  now: Date = new Date(),
): Promise<PlatformWindowSnapshot> {
  const [row] = await executeRows<PlatformWindowRow>(
    db,
    sql`
      select
        linkedin_daily_limit as "limit",
        linkedin_daily_count as "count",
        linkedin_window_start_utc as "windowStart",
        warn_threshold_percent as "warnThresholdPercent"
      from social_profiles
      where id = ${profileId}
    `,
  );

  if (!row) {
    throw new Error(`Profile ${profileId} not found`);
  }

  const dayStart = utcDayStart(now);
  const windowStart = row.windowStart;
  const isExpired = !windowStart || windowStart < dayStart;
  return {
    currentCount: isExpired ? 0 : row.count,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? DEFAULT_WARN_THRESHOLD_PERCENT,
    windowStartUtc: !isExpired && windowStart ? windowStart : dayStart,
    windowResetAt: utcNextDayStart(now),
  };
}

/**
 * Facebook hourly-window loader (LIMIT-06). Returns the effective snapshot
 * after applying the rolling-hour reset rule.
 */
export async function loadFacebookWindowUsage(
  db: RateLimitDb,
  profileId: string,
  now: Date = new Date(),
): Promise<PlatformWindowSnapshot> {
  const [row] = await executeRows<PlatformWindowRow>(
    db,
    sql`
      select
        facebook_hourly_limit as "limit",
        facebook_hourly_count as "count",
        facebook_window_start_utc as "windowStart",
        warn_threshold_percent as "warnThresholdPercent"
      from social_profiles
      where id = ${profileId}
    `,
  );

  if (!row) {
    throw new Error(`Profile ${profileId} not found`);
  }

  const hourThreshold = rollingHourThreshold(now);
  const windowStart = row.windowStart;
  const isExpired = !windowStart || windowStart < hourThreshold;
  return {
    currentCount: isExpired ? 0 : row.count,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? DEFAULT_WARN_THRESHOLD_PERCENT,
    windowStartUtc: !isExpired && windowStart ? windowStart : now,
    windowResetAt: nextHourTop(now),
  };
}
