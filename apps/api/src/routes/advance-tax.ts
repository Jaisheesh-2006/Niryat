import { financialYear, taxYearBounds } from "@niryat/rules";
import { inrRateSchema, invoiceCurrencies } from "@niryat/shared";
import { Hono } from "hono";
import { z } from "zod";
import { advanceTaxEstimate } from "../advance-tax";
import { readSession } from "../auth/session";
import { todayInIndia } from "../rules";
import type { AppDeps } from "./auth";

const querySchema = z.strictObject({
  taxYear: z
    .string()
    .refine((value) => {
      try {
        taxYearBounds(value);
        return true;
      } catch (error) {
        if (error instanceof RangeError && error.message === "Invalid tax year") return false;
        throw error;
      }
    })
    .optional(),
  rates: z
    .string()
    .transform((value) => value.split(",").map((entry) => entry.split(":")))
    .pipe(
      z.array(z.tuple([z.enum(invoiceCurrencies), inrRateSchema])).max(invoiceCurrencies.length),
    )
    .refine((entries) => new Set(entries.map(([currency]) => currency)).size === entries.length)
    .transform((entries) => Object.fromEntries(entries))
    .default({}),
  estimatedTax: z
    .string()
    .regex(/^\d{1,12}$/)
    .pipe(z.string().refine((value) => value === value.trim() && BigInt(value) <= 100_000_000_000n))
    .optional(),
});

export function advanceTaxRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/advance-tax", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const query = querySchema.safeParse(c.req.query());
    if (!query.success || Object.values(c.req.queries()).some((values) => values.length > 1)) {
      return c.json({ error: "invalid_query" }, 400);
    }
    const result = await advanceTaxEstimate(deps, userId, {
      taxYear: query.data.taxYear ?? financialYear(todayInIndia()),
      rates: query.data.rates,
      estimatedTaxInr: query.data.estimatedTax ?? null,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(result.estimate);
  });
  return routes;
}
