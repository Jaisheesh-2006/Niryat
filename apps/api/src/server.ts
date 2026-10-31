import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createClaudeRunner, createDashboardLlm, createToolkitReader } from "@niryat/agent";
import { createDb, parseEncryptionKey } from "@niryat/db";
import { createPayPalLedger, createPayPalLogin, createPayPalRestClient } from "@niryat/paypal";
import { loadAiEnv, loadAuthEnv, loadEnv, loadFileStorageEnv, loadPayPalEnv } from "./env";
import { createS3FileStore } from "./files";
import { createApp } from "./index";

try {
  process.loadEnvFile(resolve("../../.env"));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}
const env = loadEnv(process.env);
const authEnv = loadAuthEnv(process.env);
const paypalEnv = loadPayPalEnv(process.env);
const fileStorageEnv = loadFileStorageEnv(process.env);
const aiEnv = loadAiEnv(process.env);
const paypalCredentials = paypalEnv
  ? { clientId: paypalEnv.PAYPAL_CLIENT_ID, clientSecret: paypalEnv.PAYPAL_CLIENT_SECRET }
  : undefined;
const encryptionKey = authEnv ? parseEncryptionKey(authEnv.ENCRYPTION_KEY) : undefined;
const database = authEnv ? createDb(authEnv.DATABASE_URL) : undefined;
const app =
  authEnv && database && encryptionKey
    ? createApp({
        db: database.db,
        encryptionKey,
        sessionSecret: authEnv.SESSION_SECRET,
        secureCookies: env.NODE_ENV === "production",
        publicAppUrl: env.PUBLIC_APP_URL,
        ...(aiEnv
          ? {
              ai: {
                runner: createClaudeRunner({
                  apiKey: aiEnv.ANTHROPIC_API_KEY,
                  model: aiEnv.CLAUDE_MODEL,
                }),
                dashboard: createDashboardLlm(
                  { apiKey: aiEnv.ANTHROPIC_API_KEY, model: aiEnv.CLAUDE_MODEL },
                  fetch,
                ),
                monthlyBudgetUsd: aiEnv.AI_MONTHLY_BUDGET_USD,
                ...(paypalCredentials
                  ? { paypalReader: createToolkitReader(paypalCredentials) }
                  : {}),
              },
            }
          : {}),
        ...(fileStorageEnv ? { files: createS3FileStore(fileStorageEnv) } : {}),
        ...(paypalEnv && paypalCredentials
          ? {
              paypalLogin: createPayPalLogin({
                ...paypalCredentials,
                returnUrl: `${env.PUBLIC_APP_URL}/api/auth/paypal/callback`,
              }),
              paypal: {
                rest: createPayPalRestClient(paypalCredentials),
                ledger: createPayPalLedger(paypalCredentials),
                webhookId: paypalEnv.PAYPAL_WEBHOOK_ID,
              },
            }
          : {}),
      })
    : createApp();
if (!authEnv) console.log("Auth disabled: DATABASE_URL not set");
const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" });
console.log(`Niryat API listening on port ${env.PORT}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () =>
    server.close(async () => {
      await database?.close();
      process.exit(0);
    }),
  );
}
