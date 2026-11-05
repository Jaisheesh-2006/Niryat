import * as storage from "@niryat/db";
import { Hono } from "hono";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import * as session from "../auth/session";
import { syncStatusRoutes } from "./sync-status";

const database = storage.createDb("postgresql://unused@127.0.0.1:1/unused");
const app = new Hono().route(
  "/",
  syncStatusRoutes({
    db: database.db,
    encryptionKey: Buffer.alloc(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  }),
);
app.get("/test-ca-session", async (c) => {
  await session.startSession(
    c,
    "40000000-0000-4000-8000-000000000001",
    "ca",
    "x".repeat(32),
    false,
  );
  return c.body(null, 204);
});
afterAll(database.close);
afterEach(() => vi.restoreAllMocks());

it("denies missing and CA sessions without reading global seller metadata", async () => {
  const read = vi.spyOn(storage, "readSyncStatus");
  expect((await app.request("/sync-status")).status).toBe(401);
  const login = await app.request("/test-ca-session");
  const cookie = login.headers.get("Set-Cookie")?.split(";")[0];
  if (!cookie) throw new Error("Expected signed CA cookie");
  expect((await app.request("/sync-status", { headers: { Cookie: cookie } })).status).toBe(401);
  expect(read).not.toHaveBeenCalled();
});

it("returns only freshness metadata with no caching for a freelancer", async () => {
  vi.spyOn(session, "readSession").mockResolvedValue("40000000-0000-4000-8000-000000000001");
  const status = { lastSuccessAt: null, lastStatus: null, stale: true } as const;
  const read = vi.spyOn(storage, "readSyncStatus").mockResolvedValue(status);
  const response = await app.request("/sync-status");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual(status);
  expect(read).toHaveBeenCalledWith(database.db, expect.any(Date));
});
