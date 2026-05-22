import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmailLogsPage from "../EmailLogsPage";

const mocks = vi.hoisted(() => ({
  useEmailLogs: vi.fn(),
}));

vi.mock("@/hooks/use-notifications", () => ({
  useEmailLogs: mocks.useEmailLogs,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <EmailLogsPage />
    </MemoryRouter>,
  );
}

describe("EmailLogsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useEmailLogs.mockReturnValue({
      isLoading: false,
      data: {
        page: 1,
        pageSize: 50,
        total: 1,
        rows: [
          {
            id: "email-log-1",
            eventType: "publish_failed",
            recipientEmail: "user@example.com",
            subject: "Publish failed",
            status: "failed",
            errorMessage: "SMTP rejected",
            sentAt: new Date().toISOString(),
          },
        ],
      },
    });
  });

  it("renders sent and failed notification email logs", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Email logs" })).toBeInTheDocument();
    expect(screen.getByText("publish_failed")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("Publish failed")).toBeInTheDocument();
    expect(screen.getByText("SMTP rejected")).toBeInTheDocument();
  });

  it("requests older email logs with pagination controls", async () => {
    const user = userEvent.setup();
    mocks.useEmailLogs.mockReturnValue({
      isLoading: false,
      data: {
        page: 1,
        pageSize: 50,
        total: 75,
        rows: [
          {
            id: "email-log-1",
            eventType: "publish_failed",
            recipientEmail: "user@example.com",
            subject: "Publish failed",
            status: "failed",
            errorMessage: null,
            sentAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderPage();

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(mocks.useEmailLogs).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 50,
      status: undefined,
      recipient: undefined,
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(mocks.useEmailLogs).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 50,
      status: undefined,
      recipient: undefined,
    });
  });
});
