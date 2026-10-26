import { runApprovedAction } from "@niryat/agent";
import {
  actionStore,
  findPdfByToken,
  getInvoiceForAction,
  getProfile,
  issueInvoice,
  listClients,
  listInvoices,
  rejectAction,
} from "@niryat/db";
import { buildInvoiceRequest, buildSendRequest } from "@niryat/paypal";
import {
  financialYear,
  invoiceNumberFor,
  LUT_ENDORSEMENT,
  prepareExportInvoice,
} from "@niryat/rules";
import { invoiceInputSchema } from "@niryat/shared";
import { Hono } from "hono";
import { z } from "zod";
import { actionHandlers } from "../actions";
import { readSession } from "../auth/session";
import { newFileToken, pdfKey } from "../files";
import { renderInvoicePdf } from "../pdf";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";
import { parseJsonBody } from "./body";

export function invoiceRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/invoices", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    return c.json(await listInvoices(deps.db, userId));
  });
  routes.post("/invoices", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const body = await parseJsonBody(c, invoiceInputSchema);
    if (!body.ok) return body.response;
    if (body.data.type === "recurring") {
      return c.json({ error: "invalid_request", fields: ["type"] }, 400);
    }
    const files = deps.files;
    if (!files) return c.json({ error: "file_storage_unavailable" }, 503);
    const client = (await listClients(deps.db, userId, deps.encryptionKey)).find(
      (client) => client.id === body.data.clientId,
    );
    if (!client) return c.json({ error: "not_found" }, 404);
    const profile = await getProfile(deps.db, userId, deps.encryptionKey);
    const reasons: string[] = [];
    if (!profile) reasons.push("Complete your compliance profile before issuing invoices.");
    if (client.email === null)
      reasons.push("Add the client's email so PayPal can send the invoice.");
    const date = todayInIndia();
    const invoiceClient = { ...client, answers: client.exportCheck.answers };
    if (profile) {
      const prepared = prepareExportInvoice(
        {
          profile,
          client: invoiceClient,
          invoice: { ...body.data, number: "0000-00/0000", date },
        },
        { rules },
      );
      if (!prepared.ok) reasons.push(...prepared.reasons);
    }
    if (reasons.length > 0 || !profile || client.email === null || profile.legalName === null) {
      return c.json({ error: "invoice_blocked", reasons }, 422);
    }
    const { legalName } = profile;
    const clientEmail = client.email;
    let storageFailed = false;
    try {
      const invoice = await issueInvoice(
        deps.db,
        userId,
        { ...body.data, date, fy: financialYear(date) },
        async ({ id, number }) => {
          const prepared = prepareExportInvoice(
            { profile, client: invoiceClient, invoice: { ...body.data, number, date } },
            { rules },
          );
          if (!prepared.ok) throw new Error("Invoice preparation failed");
          const bytes = await renderInvoicePdf(prepared.document);
          await files.put(pdfKey(userId, id), bytes, "application/pdf").catch(() => {
            storageFailed = true;
            throw new Error("File storage request failed");
          });
          const token = newFileToken();
          const pdfUrl = `${deps.publicAppUrl ?? "http://localhost:3000"}/api/files/${token}`;
          return {
            pdfToken: token,
            pdfUrl,
            action: {
              paypalAction: "send_invoice",
              payload: {
                invoiceId: id,
                create: buildInvoiceRequest({
                  ...body.data,
                  number,
                  date,
                  legalName,
                  gstin: profile.gstRegistered ? profile.gstin : null,
                  clientName: client.name,
                  clientEmail,
                  note: `${profile.gstRegistered ? "GST invoice PDF" : "Invoice PDF"}: ${pdfUrl}`,
                  ...(profile.gstRegistered
                    ? { terms: `${LUT_ENDORSEMENT}\nLUT reference: ${profile.lutNumber}` }
                    : {}),
                }),
                send: buildSendRequest({ subject: `Invoice ${number} from ${legalName}` }),
              },
            },
          };
        },
        (seq) => invoiceNumberFor(date, seq).number,
      );
      return c.json(invoice, 201);
    } catch (error) {
      if (storageFailed) return c.json({ error: "file_storage_unavailable" }, 503);
      throw error;
    }
  });

  for (const operation of ["approve", "reject"] as const) {
    routes.post(`/actions/:id/${operation}`, async (c) => {
      const userId = await readSession(c, deps.sessionSecret);
      if (!userId) return c.json({ error: "unauthenticated" }, 401);
      const id = z.uuid().safeParse(c.req.param("id"));
      if (!id.success) return c.json({ error: "not_found" }, 404);
      const body = await parseJsonBody(c, z.strictObject({}));
      if (!body.ok) return body.response;
      const invoice = await getInvoiceForAction(deps.db, userId, id.data);
      if (!invoice) return c.json({ error: "not_found" }, 404);
      if (operation === "reject") {
        if (!(await rejectAction(deps.db, userId, id.data))) {
          return c.json({ error: "action_not_pending" }, 409);
        }
      } else {
        if (!deps.paypal) return c.json({ error: "paypal_unavailable" }, 503);
        const result = await runApprovedAction(
          actionStore(deps.db),
          actionHandlers(deps),
          id.data,
          userId,
        );
        if (!result.ok) {
          return result.reason === "not_pending"
            ? c.json({ error: "action_not_pending" }, 409)
            : c.json({ error: "paypal_failed", code: result.error }, 502);
        }
      }
      return c.json(await getInvoiceForAction(deps.db, userId, id.data));
    });
  }

  routes.get("/files/:token", async (c) => {
    const token = z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .safeParse(c.req.param("token"));
    if (!token.success) return c.json({ error: "not_found" }, 404);
    const pdf = await findPdfByToken(deps.db, token.data);
    if (!pdf) return c.json({ error: "not_found" }, 404);
    if (!deps.files) return c.json({ error: "file_storage_unavailable" }, 503);
    let bytes: Uint8Array | undefined;
    try {
      bytes = await deps.files.get(pdfKey(pdf.userId, pdf.invoiceId));
    } catch {
      return c.json({ error: "file_storage_unavailable" }, 503);
    }
    if (!bytes) return c.json({ error: "not_found" }, 404);
    return c.body(new Uint8Array(bytes), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.number.replaceAll("/", "-")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
  });
  return routes;
}
