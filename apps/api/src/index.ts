import { cite, PAYPAL_INDIA_PURPOSE_CODES } from "@niryat/rules";
import { Hono } from "hono";
import { type AppDeps, authRoutes } from "./routes/auth";
import { clientRoutes } from "./routes/clients";
import { healthCheckRoutes } from "./routes/health-check";
import { profileRoutes } from "./routes/profile";
import { rules } from "./rules";

export function createApp(deps?: AppDeps): Hono {
  const app = new Hono();
  app.get("/health", (context) => context.json({ status: "ok" }));
  app.get("/purpose-codes", (c) =>
    c.json({ citation: cite(rules, "PURPOSE_CODES"), codes: PAYPAL_INDIA_PURPOSE_CODES }),
  );
  if (deps) {
    app.route("/", clientRoutes(deps));
    app.route("/", authRoutes(deps));
    app.route("/", profileRoutes(deps));
    app.route("/", healthCheckRoutes(deps));
  }
  return app;
}
