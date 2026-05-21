import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CalendarEvent, CalendarQuery } from "@sms/shared";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformGlyph, type Platform } from "@/components/ui/platform-glyph";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendarPosts } from "@/hooks/use-calendar-posts";
import { useProfiles } from "@/hooks/use-profiles";
import { cn } from "@/lib/utils";

type CalendarView = "month" | "week" | "day";
type CalendarScope = CalendarQuery["scope"];

interface CalendarEventViewModel {
  id: string;
  platform: Platform;
  profileId: string;
  profileDisplayName: string;
  status: CalendarEvent["status"];
  scheduledAt: Date;
  textPreview: string;
  hasConflict: boolean;
}

const showOptions: ReadonlyArray<{ value: CalendarScope; label: string }> = [
  { value: "scheduled", label: "Scheduled" },
  { value: "queued", label: "Queued" },
  { value: "both", label: "Both" },
];

const viewOptions: ReadonlyArray<{ value: CalendarView; label: string }> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekHours = Array.from({ length: 13 }, (_, index) => index + 7);
const dayHours = Array.from({ length: 24 }, (_, index) => index);

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

function getVisibleRange(cursorDate: Date, view: CalendarView): { from: Date; to: Date } {
  if (view === "month") {
    const firstVisibleDay = startOfWeek(startOfMonth(cursorDate), { weekStartsOn: 0 });
    return {
      from: startOfDay(firstVisibleDay),
      to: endOfDay(addDays(firstVisibleDay, 41)),
    };
  }

  if (view === "week") {
    return {
      from: startOfDay(startOfWeek(cursorDate, { weekStartsOn: 0 })),
      to: endOfDay(endOfWeek(cursorDate, { weekStartsOn: 0 })),
    };
  }

  return { from: startOfDay(cursorDate), to: endOfDay(cursorDate) };
}

function getRangeLabel(cursorDate: Date, view: CalendarView): string {
  if (view === "month") return format(cursorDate, "MMMM yyyy");
  if (view === "week") return `Week of ${format(startOfWeek(cursorDate, { weekStartsOn: 0 }), "MMM d")}`;
  return format(cursorDate, "EEEE, MMMM d");
}

function shiftDate(cursorDate: Date, view: CalendarView, direction: "previous" | "next"): Date {
  if (view === "month") return direction === "previous" ? subMonths(cursorDate, 1) : addMonths(cursorDate, 1);
  if (view === "week") return direction === "previous" ? subWeeks(cursorDate, 1) : addWeeks(cursorDate, 1);
  return addDays(cursorDate, direction === "previous" ? -1 : 1);
}

function getMonthDays(cursorDate: Date): Date[] {
  const firstVisibleDay = startOfWeek(startOfMonth(cursorDate), { weekStartsOn: 0 });
  return Array.from({ length: 42 }, (_, index) => addDays(firstVisibleDay, index));
}

function getWeekDays(cursorDate: Date): Date[] {
  const firstVisibleDay = startOfWeek(cursorDate, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, index) => addDays(firstVisibleDay, index));
}

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function hourKey(date: Date): string {
  return `${dateKey(date)}-${format(date, "H")}`;
}

function formatHour(hour: number): string {
  return format(new Date(2026, 0, 1, hour), "ha").toLowerCase();
}

function scheduledParam(day: Date, hour = 9): string {
  const scheduledAt = new Date(day);
  scheduledAt.setHours(hour, 0, 0, 0);
  return encodeURIComponent(scheduledAt.toISOString());
}

function sortEvents(events: CalendarEventViewModel[]): CalendarEventViewModel[] {
  return [...events].sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
}

function normalizeEvent(event: CalendarEvent): CalendarEventViewModel {
  return {
    id: event.id,
    platform: event.platform,
    profileId: event.profileId,
    profileDisplayName: event.profileDisplayName,
    status: event.status,
    scheduledAt: new Date(event.scheduledAt),
    textPreview: event.textPreview,
    hasConflict: event.hasConflict,
  };
}

function eventTone(event: CalendarEventViewModel): string {
  if (event.hasConflict) {
    return "border-destructive bg-destructive/15 text-foreground";
  }

  if (event.status === "queued") {
    return "border-border bg-[var(--bg-elevated)] text-foreground hover:bg-accent";
  }

  return "border-[color-mix(in_srgb,var(--brand-accent)_35%,transparent)] bg-[var(--brand-accent-soft)] text-foreground hover:bg-[color-mix(in_srgb,var(--brand-accent-soft)_80%,var(--bg-hover))]";
}

function EventChip({
  event,
  compact = false,
  onClick,
}: {
  event: CalendarEventViewModel;
  compact?: boolean;
  onClick: (eventId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onClick(event.id);
      }}
      title={`${format(event.scheduledAt, "h:mm a")} ${event.textPreview}`}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-sm border px-1.5 text-left text-[11px] leading-5 transition-colors",
        eventTone(event),
        compact ? "h-6 w-full" : "h-5 w-full",
      )}
    >
      <PlatformGlyph platform={event.platform} size={11} />
      <span className="mono shrink-0 text-[10px] text-muted-foreground">{format(event.scheduledAt, "h:mm")}</span>
      <span className="truncate">{event.textPreview}</span>
    </button>
  );
}

function groupEventsByDay(events: CalendarEventViewModel[]): Map<string, CalendarEventViewModel[]> {
  const grouped = new Map<string, CalendarEventViewModel[]>();
  for (const event of events) {
    const key = dateKey(event.scheduledAt);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  for (const [key, value] of grouped.entries()) {
    grouped.set(key, sortEvents(value));
  }

  return grouped;
}

function groupEventsByHour(events: CalendarEventViewModel[]): Map<string, CalendarEventViewModel[]> {
  const grouped = new Map<string, CalendarEventViewModel[]>();
  for (const event of events) {
    const key = hourKey(event.scheduledAt);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  for (const [key, value] of grouped.entries()) {
    grouped.set(key, sortEvents(value));
  }

  return grouped;
}

function MonthView({
  cursorDate,
  events,
  onOpenEvent,
}: {
  cursorDate: Date;
  events: CalendarEventViewModel[];
  onOpenEvent: (eventId: string) => void;
}) {
  const today = new Date();
  const monthDays = getMonthDays(cursorDate);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  return (
    <section className="overflow-hidden rounded-md border bg-card" aria-label="Month calendar">
      <div className="grid grid-cols-7 border-b bg-[var(--bg-elevated)]">
        {dayNames.map((dayName) => (
          <div key={dayName} className="border-r px-2 py-2 text-[10px] font-semibold uppercase text-muted-foreground last:border-r-0">
            {dayName}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(96px,auto)]" role="grid" aria-label="Month days">
        {monthDays.map((day) => {
          const dayEvents = eventsByDay.get(dateKey(day)) ?? [];
          const isToday = isSameDay(day, today);
          const isOutsideMonth = !isSameMonth(day, cursorDate);

          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              aria-label={format(day, "EEEE, MMMM d")}
              className={cn(
                "min-h-24 border-r border-b p-2 last:border-r-0 [&:nth-child(7n)]:border-r-0",
                isOutsideMonth && "opacity-[.35]",
                isToday && "bg-[color-mix(in_srgb,var(--brand-accent-soft)_70%,transparent)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full text-xs font-medium",
                    isToday && "bg-[var(--brand-accent)] px-1 text-[var(--text-on-brand)]",
                  )}
                >
                  {format(day, "d")}
                </span>
                {dayEvents.length > 0 ? (
                  <span className="mono text-[10px] text-muted-foreground">{dayEvents.length}</span>
                ) : null}
              </div>
              <div className="mt-3 space-y-1">
                {dayEvents.slice(0, 4).map((event) => (
                  <EventChip key={event.id} event={event} onClick={onOpenEvent} />
                ))}
                {dayEvents.length > 4 ? (
                  <div className="mono truncate text-[10px] text-muted-foreground">+{dayEvents.length - 4} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WeekView({
  cursorDate,
  events,
  onOpenEvent,
  onCreatePost,
}: {
  cursorDate: Date;
  events: CalendarEventViewModel[];
  onOpenEvent: (eventId: string) => void;
  onCreatePost: (day: Date, hour: number) => void;
}) {
  const today = new Date();
  const weekDays = getWeekDays(cursorDate);
  const eventsByHour = useMemo(() => groupEventsByHour(events), [events]);

  return (
    <section className="overflow-hidden rounded-md border bg-card" aria-label="Week calendar">
      <div className="grid border-b bg-[var(--bg-elevated)]" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
        <div className="border-r" />
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "border-r px-2 py-2 text-center last:border-r-0",
              isSameDay(day, today) && "bg-[var(--brand-accent-soft)]",
            )}
          >
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">{format(day, "EEE")}</div>
            <div className="text-sm font-semibold">{format(day, "d")}</div>
          </div>
        ))}
      </div>
      {weekHours.map((hour) => (
        <div
          key={hour}
          className="grid min-h-11 border-b last:border-b-0"
          style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}
        >
          <div className="border-r px-2 py-2 text-right text-[11px] text-muted-foreground">{formatHour(hour)}</div>
          {weekDays.map((day) => {
            const cellEvents = eventsByHour.get(`${dateKey(day)}-${hour}`) ?? [];
            return (
              <div
                key={`${day.toISOString()}-${hour}`}
                role="button"
                tabIndex={0}
                aria-label={`Create post on ${format(day, "EEEE, MMMM d")} at ${formatHour(hour)}`}
                onClick={() => onCreatePost(day, hour)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onCreatePost(day, hour);
                }}
                className={cn(
                  "min-w-0 border-r p-1 last:border-r-0 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]",
                  isSameDay(day, today) && "bg-[color-mix(in_srgb,var(--brand-accent-soft)_45%,transparent)]",
                )}
              >
                <div className="space-y-1">
                  {cellEvents.map((event) => (
                    <EventChip key={event.id} event={event} compact onClick={onOpenEvent} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function DayView({
  cursorDate,
  events,
  onOpenEvent,
  onCreatePost,
}: {
  cursorDate: Date;
  events: CalendarEventViewModel[];
  onOpenEvent: (eventId: string) => void;
  onCreatePost: (day: Date, hour: number) => void;
}) {
  const eventsByHour = useMemo(() => groupEventsByHour(events), [events]);

  return (
    <section className="overflow-hidden rounded-md border bg-card" aria-label="Day calendar">
      {dayHours.map((hour) => {
        const cellEvents = eventsByHour.get(`${dateKey(cursorDate)}-${hour}`) ?? [];
        const isActiveHour = hour >= 8 && hour <= 20;

        return (
          <div key={hour} className="grid min-h-11 border-b last:border-b-0" style={{ gridTemplateColumns: "80px minmax(0, 1fr)" }}>
            <div className="border-r px-3 py-2 text-right text-[11px] text-muted-foreground">{formatHour(hour)}</div>
            <div className="min-w-0 p-1.5">
              {cellEvents.length > 0 ? (
                <div className="space-y-1">
                  {cellEvents.map((event) => (
                    <EventChip key={event.id} event={event} compact onClick={onOpenEvent} />
                  ))}
                </div>
              ) : isActiveHour ? (
                <button
                  type="button"
                  aria-label={`Create post at ${formatHour(hour)}`}
                  onClick={() => onCreatePost(cursorDate, hour)}
                  className="h-6 w-full rounded-sm border border-dashed border-border transition-colors hover:border-[var(--brand-accent)] hover:bg-[var(--brand-accent-soft)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<CalendarView>("month");
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [scope, setScope] = useState<CalendarScope>("both");
  const [profileId, setProfileId] = useState("all");
  const visibleRange = useMemo(() => getVisibleRange(cursorDate, view), [cursorDate, view]);
  const { data: profiles } = useProfiles();

  const query = useMemo<CalendarQuery>(
    () => ({
      from: visibleRange.from.toISOString(),
      to: visibleRange.to.toISOString(),
      scope,
      profileIds: profileId === "all" ? undefined : [profileId],
    }),
    [profileId, scope, visibleRange.from, visibleRange.to],
  );
  const { data, isLoading, isError } = useCalendarPosts(query);

  const events = useMemo(
    () => sortEvents((data?.events ?? []).map(normalizeEvent)),
    [data?.events],
  );

  function openEvent(eventId: string) {
    navigate(`/posts/${eventId}/edit`);
  }

  function createPost(day: Date, hour: number) {
    navigate(`/posts/new?scheduledAt=${scheduledParam(day, hour)}`);
  }

  return (
    <main className="p-6">
      <PageHeader
        title="Calendar"
        subtitle="Scheduled posts and queue runs across all profiles."
        actions={
          <Button asChild variant="accent">
            <Link to="/posts/new">
              <Plus aria-hidden="true" />
              New post
            </Link>
          </Button>
        }
      />

      <section aria-label="Calendar controls" className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" aria-label={`Previous ${view}`} onClick={() => setCursorDate((date) => shiftDate(date, view, "previous"))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button size="sm" onClick={() => setCursorDate(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="sm" aria-label={`Next ${view}`} onClick={() => setCursorDate((date) => shiftDate(date, view, "next"))}>
            <ChevronRight aria-hidden="true" />
          </Button>
          <h2 className="min-w-0 text-lg font-semibold leading-tight">{getRangeLabel(cursorDate, view)}</h2>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">Show:</span>
            <Segmented label="Show calendar items" value={scope} options={showOptions} onChange={setScope} />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Profile:</span>
            <NativeSelect
              aria-label="Profile filter"
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
              className="h-[30px] w-40 text-xs"
            >
              <option value="all">All profiles</option>
              {(profiles ?? []).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">View:</span>
            <Segmented label="Calendar view" value={view} options={viewOptions} onChange={setView} />
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="space-y-3">
          <span className="sr-only">Loading calendar</span>
          <Skeleton className="h-[560px] w-full rounded-md" />
        </div>
      ) : null}

      {isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Couldn't load calendar. Try again or refresh the page.
        </div>
      ) : null}

      {!isLoading && !isError ? (
        <>
          {view === "month" ? <MonthView cursorDate={cursorDate} events={events} onOpenEvent={openEvent} /> : null}
          {view === "week" ? (
            <WeekView cursorDate={cursorDate} events={events} onOpenEvent={openEvent} onCreatePost={createPost} />
          ) : null}
          {view === "day" ? (
            <DayView cursorDate={cursorDate} events={events} onOpenEvent={openEvent} onCreatePost={createPost} />
          ) : null}
        </>
      ) : null}
    </main>
  );
}
