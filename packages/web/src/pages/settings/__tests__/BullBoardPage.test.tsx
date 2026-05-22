import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import BullBoardPage from "../BullBoardPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BullBoardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BullBoardPage", () => {
  it("frames the Bull Board mount with breadcrumb, queue cards, live health, and new-tab links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        publish: { active: 0, completed: 12, failed: 0 },
        notification: { active: 1, completed: 20, failed: 0 },
        bulk_ops: { active: 0, completed: 2, failed: 1 },
      }),
    } as Response);

    renderPage();

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Worker queue inspector" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Background-job admin powered by Bull Board (BullMQ)."),
    ).toBeInTheDocument();

    for (const queue of ["publish", "notification", "bulk-ops"]) {
      expect(screen.getByText(queue)).toBeInTheDocument();
    }

    expect(screen.getByTitle("Embedded Bull Board")).toHaveAttribute(
      "src",
      "/admin/queues",
    );
    expect(
      screen.getAllByRole("link", { name: /open in new tab/i }),
    ).toHaveLength(2);
    expect(
      await screen.findByText("12 completed jobs recorded."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 active jobs are running now."),
    ).toBeInTheDocument();
    expect(screen.getByText("1 failed jobs need review.")).toBeInTheDocument();
  });
});
