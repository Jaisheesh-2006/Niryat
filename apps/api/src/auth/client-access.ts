import { hasAcceptedCaLink } from "@niryat/db";
import type { Context } from "hono";
import { z } from "zod";
import type { AppDeps } from "../routes/auth";
import { readAnySession } from "./session";

export async function readClientAccess(
  c: Context,
  deps: Pick<AppDeps, "db" | "sessionSecret">,
  clientParam: string | undefined,
): Promise<{ userId: string; viewer: "owner" | "ca" } | undefined> {
  const session = await readAnySession(c, deps.sessionSecret);
  if (!session) return undefined;
  if ((c.req.queries("client")?.length ?? 0) > 1) return undefined;
  if (session.role === "freelancer") {
    return clientParam === undefined || clientParam === session.userId
      ? { userId: session.userId, viewer: "owner" }
      : undefined;
  }
  const client = z.uuid().safeParse(clientParam);
  if (!client.success || !(await hasAcceptedCaLink(deps.db, session.userId, client.data)))
    return undefined;
  return { userId: client.data, viewer: "ca" };
}

// Unlinked and missing clients look the same, so a CA cannot probe which ids exist.
export async function clientAccessDenied(c: Context, sessionSecret: string): Promise<Response> {
  return (await readAnySession(c, sessionSecret))
    ? c.json({ error: "not_found" }, 404)
    : c.json({ error: "unauthenticated" }, 401);
}
