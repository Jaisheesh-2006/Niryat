import { createUser, type Db, findUserByEmail, findUserById } from "@niryat/db";
import { credentialsSchema } from "@niryat/shared";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password";
import { endSession, readSession, startSession } from "../auth/session";

export interface AppDeps {
  db: Db;
  encryptionKey: Buffer;
  sessionSecret: string;
  secureCookies: boolean;
}

const dummyHash = `scrypt$16384$8$1$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(64).toString("base64")}`;

export function authRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.use("*", async (c, next) => {
    if (
      c.req.method === "POST" &&
      c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
    ) {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
    await next();
  });

  // shortcut: no rate limiting on login; add before any public deployment.
  for (const action of ["signup", "login"] as const) {
    routes.post(`/auth/${action}`, async (c) => {
      const body = await c.req.json<unknown>().catch(() => undefined);
      const parsed = credentialsSchema.safeParse(body);
      if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
        return c.json({ error: "invalid_request", fields }, 400);
      }
      const { email, password } = parsed.data;
      if (action === "signup") {
        const user = await createUser(deps.db, {
          email,
          passwordHash: await hashPassword(password),
        });
        if (!user) return c.json({ error: "email_taken" }, 409);
        await startSession(c, user.id, deps.sessionSecret, deps.secureCookies);
        return c.json(user, 201);
      }
      const user = await findUserByEmail(deps.db, email);
      const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
      if (!user || !valid) return c.json({ error: "invalid_credentials" }, 401);
      await startSession(c, user.id, deps.sessionSecret, deps.secureCookies);
      return c.json({ id: user.id, email: user.email });
    });
  }

  routes.post("/auth/logout", (c) => {
    endSession(c);
    return c.body(null, 204);
  });
  routes.get("/auth/me", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    const user = userId ? await findUserById(deps.db, userId) : undefined;
    return user ? c.json(user) : c.json({ error: "unauthenticated" }, 401);
  });
  return routes;
}
