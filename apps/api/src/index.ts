import { cite, PAYPAL_INDIA_PURPOSE_CODES } from "@niryat/rules";
import { Hono } from "hono";
import { rateLimitMiddleware } from "./rate-limit";
import { advanceTaxRoutes } from "./routes/advance-tax";
import { type AppDeps, authRoutes } from "./routes/auth";
import { caLinkRoutes } from "./routes/ca-links";
import { calendarRoutes } from "./routes/calendar";
import { clientRoutes } from "./routes/clients";
import { closeRoutes } from "./routes/close";
import { dashboardRoutes } from "./routes/dashboard";
import { extractRoutes } from "./routes/extract";
import { firaRoutes } from "./routes/fira";
import { gstr1Routes } from "./routes/gstr1";
import { healthCheckRoutes } from "./routes/health-check";
import { invoiceRoutes } from "./routes/invoices";
import { profileRoutes } from "./routes/profile";
import { syncStatusRoutes } from "./routes/sync-status";
import { taskRoutes } from "./routes/tasks";
import { webhookRoutes } from "./routes/webhooks";
import { rules } from "./rules";

export function createApp(deps?: AppDeps): Hono {
  const app = new Hono();
  app.get("/health", (context) => context.json({ status: "ok" }));
  app.get("/judge-mode", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ enabled: deps?.judgeMode === true });
  });
  app.get("/purpose-codes", (c) =>
    c.json({ citation: cite(rules, "PURPOSE_CODES"), codes: PAYPAL_INDIA_PURPOSE_CODES }),
  );
  if (deps) {
    app.use("*", rateLimitMiddleware(deps));
    app.route("/", advanceTaxRoutes(deps));
    app.route("/", calendarRoutes(deps));
    app.route("/", caLinkRoutes(deps));
    app.route("/", dashboardRoutes(deps));
    if (deps.paypal) app.route("/", webhookRoutes(deps));
    app.route("/", firaRoutes(deps));
    app.route("/", gstr1Routes(deps));
    app.route("/", clientRoutes(deps));
    app.route("/", closeRoutes(deps));
    app.route("/", extractRoutes(deps));
    app.route("/", invoiceRoutes(deps));
    app.route("/", taskRoutes(deps));
    app.route("/", syncStatusRoutes(deps));
    app.route("/", authRoutes(deps));
    app.route("/", profileRoutes(deps));
    app.route("/", healthCheckRoutes(deps));
  }
  return app;
}
