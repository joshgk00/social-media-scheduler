import 'react-big-calendar/lib/css/react-big-calendar.css';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { DateTime } from 'luxon';
import { Calendar, type EventProps, type SlotInfo, type View } from 'react-big-calendar';
import { useNavigate, useSearchParams } from 'react-router';
import type { CalendarEvent as CalendarApiEvent, CalendarQuery } from '@sms/shared';
import { Skeleton } from '../../components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { useCalendarPosts } from '../../hooks/use-calendar-posts';
import { calendarLocalizer } from '../../lib/calendar-localizer';
import { cn } from '../../lib/utils';
import { CalendarFilterBar } from './CalendarFilterBar';
import { CalendarToolbar } from './CalendarToolbar';

type CalendarFilterState = Pick<CalendarQuery, 'scope' | 'platforms' | 'profileIds' | 'tagIds' | 'search'>;

interface CalendarEventViewModel {
  id: string;
  start: Date;
  end: Date;
  title: string;
  platform: CalendarApiEvent['platform'];
  hasConflict: boolean;
  textPreview: string;
  scheduledAt: string;
}

function initMonthRange(reference = DateTime.local()): { from: string; to: string } {
  return {
    from: reference.startOf('month').minus({ days: 7 }).toUTC().toISO()!,
    to: reference.endOf('month').plus({ days: 7 }).toUTC().toISO()!,
  };
}

export function normalizeRange(input: Date | Date[] | { start: Date; end: Date }): { from: string; to: string } {
  if (input instanceof Date) {
    return { from: input.toISOString(), to: input.toISOString() };
  }
  if (Array.isArray(input)) {
    return {
      from: input[0]!.toISOString(),
      to: input[input.length - 1]!.toISOString(),
    };
  }
  return { from: input.start.toISOString(), to: input.end.toISOString() };
}

function platformAbbreviation(platform: CalendarApiEvent['platform']): string {
  if (platform === 'twitter') return 'TW';
  if (platform === 'linkedin') return 'LI';
  return 'FB';
}

function hasActiveCalendarFilters(filters: CalendarFilterState): boolean {
  return filters.scope !== 'both'
    || Boolean(filters.search)
    || Boolean(filters.platforms?.length)
    || Boolean(filters.profileIds?.length)
    || Boolean(filters.tagIds?.length);
}

function CalendarEventContent({ event }: EventProps<CalendarEventViewModel>) {
  const conflictMessage = `Another post on this profile is scheduled within 5 minutes of this time: "${event.textPreview}" at ${format(new Date(event.scheduledAt), 'MMM d, yyyy h:mm a')}.`;
  const describedById = event.hasConflict ? `calendar-conflict-${event.id}` : undefined;
  const content = (
    <span aria-describedby={describedById} className="block text-sm">
      {event.title}
    </span>
  );

  if (!event.hasConflict) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent id={describedById}>
        {conflictMessage}
      </TooltipContent>
    </Tooltip>
  );
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<View>('month');
  const [range, setRange] = useState<{ from: string; to: string }>(() => initMonthRange());
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [filters, setFilters] = useState<CalendarFilterState>({
    scope: 'both',
    search: searchParams.get('search')?.trim() || undefined,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedSearch = searchInput.trim();
      setSearchParams(trimmedSearch ? { search: trimmedSearch } : {}, { replace: true });
      setFilters((previousFilters) => ({
        ...previousFilters,
        search: trimmedSearch || undefined,
      }));
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInput, setSearchParams]);

  const query = useMemo<CalendarQuery>(
    () => ({
      from: range.from,
      to: range.to,
      scope: filters.scope,
      platforms: filters.platforms,
      profileIds: filters.profileIds,
      tagIds: filters.tagIds,
      search: filters.search,
    }),
    [filters, range.from, range.to],
  );
  const { data, isLoading, isError } = useCalendarPosts(query);

  const events = useMemo<CalendarEventViewModel[]>(
    () =>
      (data?.events ?? []).map((event) => ({
        id: event.id,
        start: new Date(event.scheduledAt),
        end: new Date(event.scheduledAt),
        title: `${platformAbbreviation(event.platform)} · ${event.textPreview}`,
        platform: event.platform,
        hasConflict: event.hasConflict,
        textPreview: event.textPreview,
        scheduledAt: event.scheduledAt,
      })),
    [data?.events],
  );
  const isFilterActive = hasActiveCalendarFilters(filters);

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Scheduled posts and queue runs across all profiles.
        </p>
      </header>

      <CalendarFilterBar
        filters={filters}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onFiltersChange={setFilters}
      />

      {isLoading ? (
        <div className="space-y-3">
          <span className="sr-only">Loading calendar…</span>
          <Skeleton className="h-[640px] w-full rounded-md" />
        </div>
      ) : null}

      {isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Couldn't load calendar. Try again or refresh the page.
        </div>
      ) : null}

      {!isLoading && !isError ? (
        <TooltipProvider>
          <div className="relative rounded-lg border bg-card p-4">
            {events.length === 0 ? (
              <div className="pointer-events-none absolute inset-x-4 top-24 z-10 flex justify-center">
                <div className="rounded-md border bg-background px-4 py-3 text-center shadow-sm">
                  {isFilterActive ? (
                    <p className="text-sm text-muted-foreground">
                      No posts match the current filters. Try clearing a filter to see more.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No posts in this {view}.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
            <Calendar
              localizer={calendarLocalizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              views={['month', 'week', 'day']}
              view={view}
              onView={(nextView) => setView(nextView)}
              components={{ toolbar: CalendarToolbar, event: CalendarEventContent }}
              eventPropGetter={(event) => ({
                className: cn(
                  'border-l-4 px-2 py-1',
                  event.platform === 'twitter' && 'border-platform-twitter bg-platform-twitter/10',
                  event.platform === 'linkedin' && 'border-platform-linkedin bg-platform-linkedin/10',
                  event.platform === 'facebook' && 'border-platform-facebook bg-platform-facebook/10',
                  event.hasConflict && '!border-l-destructive',
                ),
              })}
              onRangeChange={(input) => setRange(normalizeRange(input as Date | Date[] | { start: Date; end: Date }))}
              onSelectEvent={(event) => navigate(`/posts/${event.id}/edit`)}
              onSelectSlot={(slotInfo: SlotInfo) => navigate(`/posts/new?scheduledAt=${encodeURIComponent(slotInfo.start.toISOString())}`)}
              selectable
              popup
            />
          </div>
        </TooltipProvider>
      ) : null}
    </main>
  );
}
