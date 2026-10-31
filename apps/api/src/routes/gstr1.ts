import { gstr1ExportRows } from "@niryat/rules";
import { gstr1FileRequestSchema, gstr1FileSchema, gstr1PeriodSchema } from "@niryat/shared";
import { Hono } from "hono";
import { z } from "zod";
import { readSession } from "../auth/session";
import { gstr1Csv, gstr1Preview } from "../gstr1";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";

const querySchema = z.strictObject({ period: gstr1PeriodSchema.optional() });

export function gstr1Routes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/gstr1", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const query = querySchema.safeParse(c.req.query());
    if (!query.success || (c.req.queries("period")?.length ?? 0) > 1) {
      return c.json({ error: "invalid_period" }, 400);
    }
    const result = await gstr1Preview(deps, userId, query.data.period, todayInIndia());
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(result.preview);
  });
  routes.post("/gstr1/file", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    if (c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
    const body = gstr1FileRequestSchema.safeParse(
      await c.req.json<unknown>().catch(() => undefined),
    );
    if (!body.success) {
      const error = body.error.issues.some((issue) => issue.path[0] === "period")
        ? "invalid_period"
        : "invalid_rates";
      return c.json({ error }, 400);
    }
    const { period, rates } = body.data;
    const result = await gstr1Preview(deps, userId, period, todayInIndia());
    if (!result.ok) return c.json({ error: result.error }, result.status);
    const { preview, lut } = result;
    if (
      Object.keys(rates).some((id) => !preview.invoices.some((invoice) => invoice.invoiceId === id))
    ) {
      return c.json({ error: "invalid_rates" }, 400);
    }
    const covered = preview.invoices.filter((invoice) => invoice.lutCovered);
    if (!covered.length) return c.json({ error: "empty_period" }, 409);
    const missing = covered
      .filter((invoice) => !rates[invoice.invoiceId])
      .map((invoice) => invoice.number);
    if (missing.length) return c.json({ error: "rates_missing", invoices: missing }, 400);
    const file = gstr1ExportRows(
      {
        invoices: preview.invoices.map((invoice) => ({
          invoiceId: invoice.invoiceId,
          number: invoice.number,
          date: invoice.date,
          amount: invoice.amount,
          inrRate: rates[invoice.invoiceId]?.inrRate ?? null,
          gstRate: rates[invoice.invoiceId]?.gstRate ?? null,
        })),
        lut,
      },
      rules,
    );
    return c.json(
      gstr1FileSchema.parse({
        fileName: `GSTR1-6A-${period}.csv`,
        csv: gstr1Csv(file.rows),
        rows: file.rows.length,
        excluded: file.excluded,
        totalInr: file.totalInr,
      }),
    );
  });
  return routes;
}
