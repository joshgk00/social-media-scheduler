import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CalendarQuery, CalendarResponse } from "@sms/shared";
import CalendarPage, { normalizeRange } from "../CalendarPage";

const navigate = vi.fn();
const useCalendarPostsMock = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/hooks/use-profiles", () => ({
  useProfiles: () => ({
    data: [
      {
        id: "profile-1",
        displayName: "Downtown Store",
        handle: "@downtown",
        platform: "twitter",
      },
    ],
  }),
}));

vi.mock("@/hooks/use-calendar-posts", () => ({
  useCalendarPosts: (query: CalendarQuery | undefined) => useCalendarPostsMock(query),
}));

function buildResponse(events: CalendarResponse["events"]): CalendarResponse {
  return { events };
}

function buildEvent(overrides: Partial<CalendarResponse["events"][number]> = {}): CalendarResponse["events"][number] {
  return {
    id: "default-event",
    platform: "twitter",
    profileId: "profile-1",
    profileDisplayName: "Downtown Store",
    status: "scheduled",
    scheduledAt: "2026-05-21T12:00:00.000Z",
    textPreview: "Default event",
    hasConflict: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CalendarPage />
    </MemoryRouter>,
  );
}

function latestCalendarQuery(): CalendarQuery {
  return useCalendarPostsMock.mock.calls.at(-1)?.[0];
}

describe("CalendarPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T16:00:00.000Z"));
    vi.clearAllMocks();
    useCalendarPostsMock.mockReturnValue({
      data: buildResponse([buildEvent()]),
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("always renders the full 6-week month grid with no events", () => {
    useCalendarPostsMock.mockReturnValue({
      data: buildResponse([]),
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByRole("heading", { name: "May 2026" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Show calendar items" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Calendar view" })).toBeInTheDocument();
    expect(screen.getByText("Show:")).toBeInTheDocument();
    expect(screen.getByText("View:")).toBeInTheDocument();
    expect(within(screen.getByRole("grid", { name: "Month days" })).getAllByRole("gridcell")).toHaveLength(42);
    expect(screen.queryByText(/No posts in this/i)).not.toBeInTheDocument();
  });

  it("renders scheduled, queued, and conflict event chips with truncating text", () => {
    useCalendarPostsMock.mockReturnValue({
      data: buildResponse([
        buildEvent({
          id: "scheduled-event",
          platform: "twitter",
          status: "scheduled",
          scheduledAt: "2026-05-21T12:00:00.000Z",
          textPreview: "Scheduled launch with a very long message that should truncate in the chip",
        }),
        buildEvent({
          id: "queued-event",
          platform: "linkedin",
          status: "queued",
          scheduledAt: "2026-05-21T13:00:00.000Z",
          textPreview: "Queued update",
        }),
        buildEvent({
          id: "conflict-event",
          platform: "facebook",
          status: "scheduled",
          scheduledAt: "2026-05-21T14:00:00.000Z",
          textPreview: "Conflict update",
          hasConflict: true,
        }),
      ]),
      isLoading: false,
      isError: false,
    });

    renderPage();

    const scheduledText = screen.getByText(/Scheduled launch/i);
    const queuedChip = screen.getByText("Queued update").closest("button");
    const conflictChip = screen.getByText("Conflict update").closest("button");

    expect(scheduledText).toHaveClass("truncate");
    expect(queuedChip).toHaveClass("bg-[var(--bg-elevated)]");
    expect(conflictChip).toHaveClass("border-destructive");
  });

  it("navigates to the edit page when an event is selected", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Default event/i }));

    expect(navigate).toHaveBeenCalledWith("/posts/default-event/edit");
  });

  it("switches between month, week, and day views", () => {
    renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "Week" }));
    expect(screen.getByLabelText("Week calendar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Day" }));
    expect(screen.getByLabelText("Day calendar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Month" }));
    expect(screen.getByLabelText("Month calendar")).toBeInTheDocument();
  });

  it("updates the calendar query when show and profile filters change", () => {
    renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "Queued" }));
    fireEvent.change(screen.getByLabelText("Profile filter"), { target: { value: "profile-1" } });

    expect(latestCalendarQuery()).toMatchObject({
      scope: "queued",
      profileIds: ["profile-1"],
    });
  });

  it("returns to the real current month when Today is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "June 2026" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { name: "May 2026" })).toBeInTheDocument();
  });

  it("navigates to the new post route from an active empty day slot", () => {
    useCalendarPostsMock.mockReturnValue({
      data: buildResponse([]),
      isLoading: false,
      isError: false,
    });
    renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "Day" }));
    fireEvent.click(screen.getByRole("button", { name: "Create post at 8am" }));

    const expectedDate = new Date("2026-05-21T16:00:00.000Z");
    expectedDate.setHours(8, 0, 0, 0);
    expect(navigate).toHaveBeenCalledWith(`/posts/new?scheduledAt=${encodeURIComponent(expectedDate.toISOString())}`);
  });

  it("normalizes month, week, and day range shapes", () => {
    expect(normalizeRange({
      start: new Date("2026-06-01T00:00:00.000Z"),
      end: new Date("2026-06-30T00:00:00.000Z"),
    })).toEqual({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T00:00:00.000Z",
    });

    expect(normalizeRange([
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-07T00:00:00.000Z"),
    ])).toEqual({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-07T00:00:00.000Z",
    });

    expect(normalizeRange([
      new Date("2026-06-01T14:30:00.000Z"),
    ])).toEqual({
      from: "2026-06-01T14:30:00.000Z",
      to: "2026-06-01T14:30:00.000Z",
    });
  });
});
