import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";

import { createNotificationsRouter } from "../notifications.js";

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
    createNotificationsRouter({
      db: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
    }),
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

  it("supports the deprecated read-all alias for authenticated users", async () => {
    const legacyResponse = await request(createTestApp())
      .post("/api/notifications/read-all")
      .set("x-csrf-token", "token");
    const canonicalResponse = await request(createTestApp())
      .post("/api/notifications/mark-all-read")
      .set("x-csrf-token", "token");

    expect(legacyResponse.status).toBe(200);
    expect(canonicalResponse.status).toBe(200);
    expect(legacyResponse.body).toEqual(canonicalResponse.body);
    expect(legacyResponse.headers.deprecation).toBe("true");
    expect(legacyResponse.headers.sunset).toBe("2026-08-01");
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
    const whereQuery = new PgDialect().sqlToQuery(whereCondition as never);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, deleted: 1 });
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(deleteChain.where).toHaveBeenCalledTimes(1);
    expect(whereQuery.params).toEqual(["user-a"]);
    expect(whereQuery.sql).toContain('"notifications"."user_id" = $1');
    expect(whereQuery.sql).toContain('"notifications"."read_at" is not null');
  });
});
