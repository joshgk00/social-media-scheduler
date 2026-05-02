import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CalendarResponse, CalendarQuery } from '@sms/shared';
import CalendarPage, { normalizeRange } from '../CalendarPage';

const navigate = vi.fn();
const setSearchParams = vi.fn();
const useCalendarPostsMock = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [new URLSearchParams(), setSearchParams],
  };
});

vi.mock('../../../hooks/use-profiles', () => ({
  useProfiles: () => ({ data: [] }),
}));

vi.mock('../../../hooks/use-tags', () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock('../../../hooks/use-calendar-posts', () => ({
  useCalendarPosts: (query: CalendarQuery | undefined) => useCalendarPostsMock(query),
}));

vi.mock('react-big-calendar', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    luxonLocalizer: vi.fn(() => ({ kind: 'localizer' })),
    Calendar: (props: {
      events: Array<Record<string, unknown>>;
      components?: { toolbar?: (props: Record<string, unknown>) => ReactNode; event?: (props: Record<string, unknown>) => ReactNode };
      eventPropGetter?: (event: Record<string, unknown>) => { className?: string };
      onSelectEvent?: (event: Record<string, unknown>) => void;
      onSelectSlot?: (slotInfo: { start: Date }) => void;
      onRangeChange?: (input: Date[] | { start: Date; end: Date }) => void;
      onView?: (view: string) => void;
      view: string;
    }) => {
      const Toolbar = props.components?.toolbar;
      const EventComponent = props.components?.event;

      return (
        <div>
          {Toolbar ? (
            <Toolbar
              label="June 2026"
              view={props.view}
              views={['month', 'week', 'day']}
              onNavigate={vi.fn()}
              onView={(nextView: string) => {
                props.onView?.(nextView);
                if (nextView === 'week') {
                  props.onRangeChange?.([
                    new Date('2026-06-01T00:00:00.000Z'),
                    new Date('2026-06-07T00:00:00.000Z'),
                  ]);
                  return;
                }
                if (nextView === 'day') {
                  props.onRangeChange?.([new Date('2026-06-01T14:30:00.000Z')]);
                  return;
                }
                props.onRangeChange?.({
                  start: new Date('2026-06-01T00:00:00.000Z'),
                  end: new Date('2026-06-30T00:00:00.000Z'),
                });
              }}
            />
          ) : null}

          <button type="button" onClick={() => props.onSelectSlot?.({ start: new Date('2026-06-01T14:30:00.000Z') })}>
            Select slot
          </button>

          {props.events.map((event) => {
            const className = props.eventPropGetter?.(event).className ?? '';
            const title = String(event.title);
            return (
              <button
                key={String(event.id)}
                type="button"
                className={className}
                onClick={() => props.onSelectEvent?.(event)}
              >
                {EventComponent ? <EventComponent event={event} title={title} /> : title}
              </button>
            );
          })}
        </div>
      );
    },
  };
});

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function buildResponse(events: CalendarResponse['events']): CalendarResponse {
  return { events };
}

function buildEvent(overrides: Partial<CalendarResponse['events'][number]> = {}): CalendarResponse['events'][number] {
  return {
    id: 'default-event',
    platform: 'twitter',
    profileId: 'profile-1',
    profileDisplayName: 'Twitter',
    status: 'scheduled',
    scheduledAt: '2026-06-01T12:00:00.000Z',
    textPreview: 'Default event',
    hasConflict: false,
    ...overrides,
  };
}

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCalendarPostsMock.mockReturnValue({
      data: buildResponse([buildEvent()]),
      isLoading: false,
      isError: false,
    });
  });

  it('renders the M/W/D switcher and re-queries when the view changes', async () => {
    render(<CalendarPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'W' }));

    expect(useCalendarPostsMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('applies platform classes to each calendar event', () => {
    useCalendarPostsMock.mockReturnValue({
      data: buildResponse([
        {
          id: 'twitter-event',
          platform: 'twitter',
          profileId: 'profile-1',
          profileDisplayName: 'Twitter',
          status: 'scheduled',
          scheduledAt: '2026-06-01T12:00:00.000Z',
          textPreview: 'Tweet',
          hasConflict: false,
        },
        {
          id: 'linkedin-event',
          platform: 'linkedin',
          profileId: 'profile-2',
          profileDisplayName: 'LinkedIn',
          status: 'queued',
          scheduledAt: '2026-06-01T13:00:00.000Z',
          textPreview: 'LinkedIn',
          hasConflict: false,
        },
        {
          id: 'facebook-event',
          platform: 'facebook',
          profileId: 'profile-3',
          profileDisplayName: 'Facebook',
          status: 'publishing',
          scheduledAt: '2026-06-01T14:00:00.000Z',
          textPreview: 'Facebook',
          hasConflict: false,
        },
      ]),
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);

    expect(screen.getByRole('button', { name: /TW · Tweet/i })).toHaveClass('border-platform-twitter');
    expect(screen.getByRole('button', { name: /LI · LinkedIn/i })).toHaveClass('border-platform-linkedin');
    expect(screen.getByRole('button', { name: /FB · Facebook/i })).toHaveClass('border-platform-facebook');
  });

  it('applies the destructive border class to conflict events', () => {
    useCalendarPostsMock.mockReturnValue({
      data: buildResponse([
        {
          id: 'conflict-event',
          platform: 'twitter',
          profileId: 'profile-1',
          profileDisplayName: 'Twitter',
          status: 'scheduled',
          scheduledAt: '2026-06-01T12:00:00.000Z',
          textPreview: 'Conflicting post',
          hasConflict: true,
        },
      ]),
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);

    expect(screen.getByRole('button', { name: /TW · Conflicting post/i })).toHaveClass('!border-l-destructive');
  });

  it('navigates to the edit page when an event is selected', async () => {
    useCalendarPostsMock.mockReturnValue({
      data: buildResponse([
        {
          id: 'abc',
          platform: 'twitter',
          profileId: 'profile-1',
          profileDisplayName: 'Twitter',
          status: 'scheduled',
          scheduledAt: '2026-06-01T12:00:00.000Z',
          textPreview: 'Edit me',
          hasConflict: false,
        },
      ]),
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /TW · Edit me/i }));

    expect(navigate).toHaveBeenCalledWith('/posts/abc/edit');
  });

  it('navigates to the new post route when an empty slot is selected', async () => {
    render(<CalendarPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Select slot' }));

    expect(navigate).toHaveBeenCalledWith('/posts/new?scheduledAt=2026-06-01T14%3A30%3A00.000Z');
  });

  it('normalizes month, week, and day range shapes', () => {
    expect(normalizeRange({
      start: new Date('2026-06-01T00:00:00.000Z'),
      end: new Date('2026-06-30T00:00:00.000Z'),
    })).toEqual({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T00:00:00.000Z',
    });

    expect(normalizeRange([
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-07T00:00:00.000Z'),
    ])).toEqual({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-07T00:00:00.000Z',
    });

    expect(normalizeRange([
      new Date('2026-06-01T14:30:00.000Z'),
    ])).toEqual({
      from: '2026-06-01T14:30:00.000Z',
      to: '2026-06-01T14:30:00.000Z',
    });
  });
});
