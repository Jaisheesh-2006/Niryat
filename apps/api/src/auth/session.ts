import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";

export const SESSION_COOKIE = "niryat_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const sessionSchema = z.tuple([z.uuid(), z.string().regex(/^\d+$/)]);

// shortcut: signed cookie, no server-side revocation; add a sessions table if logout-everywhere is needed.
export async function startSession(
  c: Context,
  userId: string,
  secret: string,
  secure: boolean,
): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE, `${userId}.${Math.floor(Date.now() / 1000)}`, secret, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function readSession(
  c: Context,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string | undefined> {
  const value = await getSignedCookie(c, secret, SESSION_COOKIE).catch(() => undefined);
  if (!value) return undefined;
  const parsed = sessionSchema.safeParse(value.split("."));
  if (!parsed.success) return undefined;
  const [userId, timestamp] = parsed.data;
  const issuedAt = Number(timestamp);
  const age = nowSeconds - issuedAt;
  return Number.isSafeInteger(issuedAt) && age >= 0 && age <= SESSION_MAX_AGE_SECONDS
    ? userId
    : undefined;
}

export function endSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
