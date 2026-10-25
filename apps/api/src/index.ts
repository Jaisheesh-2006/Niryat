import { Hono } from "hono";
import { type AppDeps, authRoutes } from "./routes/auth";
import { profileRoutes } from "./routes/profile";

export function createApp(deps?: AppDeps): Hono {
  const app = new Hono();
  app.get("/health", (context) => context.json({ status: "ok" }));
  if (deps) {
    app.route("/", authRoutes(deps));
    app.route("/", profileRoutes(deps));
  }
  return app;
}
