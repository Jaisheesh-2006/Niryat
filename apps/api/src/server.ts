import { serve } from "@hono/node-server";
import { loadEnv } from "./env";
import { app } from "./index";

const env = loadEnv(process.env);
const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" });
console.log(`Niryat API listening on port ${env.PORT}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
