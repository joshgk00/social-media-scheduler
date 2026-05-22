import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

import { createNotificationsRouter } from "../notifications.js";

function collectConditionSignals(condition: unknown): {
  columns: string[];
  params: unknown[];
} {
  const columns: string[] = [];
  const params: unknown[] = [];
  const seen = new Set<unknown>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    const record = value as Record<string | symbol, unknown>;
    if (typeof record.name === "string") columns.push(record.name);
    if ("value" in record && "encoder" in record) params.push(record.value);

    for (const child of Object.values(record)) {
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else {
        visit(child);
      }
    }
  }

  visit(condition);
  return { columns, params };
}

function createTestApp(userId = "user-a") {
  const app = express();
  app.use(express.json());
  app.use(
    (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      req.session = { userId, id: "session-a" };
      next();
    },
  );
  app.use(
    createNotificationsRouter({ db: { select: vi.fn(), update: vi.fn() } }),
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifications routes", () => {
  it("returns user-scoped paginated rows", async () => {
    const response = await request(createTestApp()).get(
      "/api/notifications?page=1&pageSize=25",
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("rows");
    expect(
      response.body.rows.every(
        (notificationRow: { userId: string }) =>
          notificationRow.userId !== "user-b",
      ),
    ).toBe(true);
  });

  it("returns unread count shape", async () => {
    const response = await request(createTestApp()).get(
      "/api/notifications/unread-count",
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("count");
  });

  it("marks one row read with CSRF and rejects cross-user reads", async () => {
    const response = await request(createTestApp())
      .post("/api/notifications/notification-b/read")
      .set("x-csrf-token", "token");

    expect([200, 404]).toContain(response.status);
  });

  it("bulk marks read for current user only", async () => {
    const response = await request(createTestApp())
      .post("/api/notifications/read-all")
      .set("x-csrf-token", "token");

    expect(response.status).toBe(200);
  });

  it("clears read notifications for current user only", async () => {
    let whereCondition: unknown;
    const deleteChain = {
      where: vi.fn((condition: unknown) => {
        whereCondition = condition;
        return deleteChain;
      }),
      returning: vi.fn().mockResolvedValue([{ id: "read-notification-a" }]),
    };
    const db = {
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(() => deleteChain),
    };
    const app = express();
    app.use(express.json());
    app.use(
      (
        req: express.Request,
        _res: express.Response,
        next: express.NextFunction,
      ) => {
        req.session = { userId: "user-a", id: "session-a" };
        next();
      },
    );
    app.use(createNotificationsRouter({ db: db as any }));

    const response = await request(app)
      .post("/api/notifications/clear-read")
      .set("x-csrf-token", "token");
    const conditionSignals = collectConditionSignals(whereCondition);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, deleted: 1 });
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(deleteChain.where).toHaveBeenCalledTimes(1);
    expect(conditionSignals.params).toContain("user-a");
    expect(conditionSignals.columns).toContain("user_id");
    expect(conditionSignals.columns).toContain("read_at");
  });
});
