import type { UserRole } from "@niryat/shared";
import { Hono } from "hono";
import { startSession } from "./session";

export async function cookieFor(
  userId: string,
  secret: string,
  role: UserRole = "freelancer",
): Promise<string> {
  const auth = new Hono();
  auth.get("/", async (c) => {
    await startSession(c, userId, role, secret, false);
    return c.json({ ok: true });
  });
  const cookie = (await auth.request("/")).headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Expected cookie");
  return cookie;
}
