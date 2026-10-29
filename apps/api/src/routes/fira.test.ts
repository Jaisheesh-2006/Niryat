import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  clients,
  firaCandidates,
  firaDocuments,
  firaLines,
  invoices,
  matches,
  recordPayment,
  recordRefund,
} from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { firaDocumentSchema, invoiceViewSchema } from "@niryat/shared";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type ParsedFiraLine, parseFiraText } from "../fira";
import { createApp } from "../index";
import type { AppDeps } from "./auth";

const fixture = readFileSync(new URL("../fixtures/fira-synthetic.txt", import.meta.url), "utf8");
const parsed = parseFiraText(fixture);
if (!parsed.ok) throw new Error("Invalid synthetic fixture");
const lines = parsed.lines;

async function pdfBytes(text = fixture) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([1000, 800]);
  text
    .trim()
    .split(/\r?\n/)
    .forEach((row, index) => {
      page.drawText(row, { x: 30, y: 760 - index * 20, size: 10, font });
    });
  return new Uint8Array(await pdf.save());
}

describe.skipIf(!testDatabaseUrl)("FIRA routes", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let deps: AppDeps;
  let app: ReturnType<typeof createApp>;
  let objects: Map<string, Uint8Array>;
  let bytes: Uint8Array<ArrayBuffer>;
  beforeAll(async () => {
    t = await openTestDb();
    bytes = await pdfBytes();
  });
  beforeEach(async () => {
    await t.reset();
    objects = new Map();
    deps = {
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: "x".repeat(32),
      secureCookies: false,
      files: {
        put: vi.fn(async (key, body) => {
          objects.set(key, body);
        }),
        get: vi.fn(async (key) => objects.get(key)),
      },
    };
    app = createApp(deps);
  });
  afterAll(async () => {
    await t?.close();
  });

  function post(cookie: string, path: string, body: unknown = {}) {
    return app.request(path, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  function upload(cookie: string, body = bytes, headers: Record<string, string> = {}) {
    return app.request("/fira", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/pdf",
        "X-Niryat-Consent": "own-fira",
        ...headers,
      },
      body,
    });
  }
  async function signup(email = "fira-a@example.com") {
    const response = await post("", "/auth/signup", { email, password: "correct-horse-battery" });
    expect(response.status).toBe(201);
    const user = z.object({ id: z.uuid() }).parse(await response.json());
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected cookie");
    return { ...user, cookie };
  }
  async function ledger(
    userId: string,
    source: ParsedFiraLine,
    seq: number,
    captureId = source.reference,
    receivedAt = `${source.date}T12:00:00+05:30`,
    paid = true,
  ) {
    const [client] = await t.db
      .insert(clients)
      .values({ userId, name: "Synthetic Client", country: "US" })
      .returning();
    if (!client) throw new Error("Expected client");
    const [invoice] = await t.db
      .insert(invoices)
      .values({
        userId,
        clientId: client.id,
        type: "one_time",
        number: `2026-27/${seq}`,
        fy: "2026-27",
        seq,
        date: source.date,
        currency: source.currency,
        amount: source.amount,
        description: "Synthetic invoice",
        sac: "998314",
        status: "sent",
        pdfUrl: "/api/files/synthetic",
        paypalInvoiceId: `INV2-${randomUUID()}`,
      })
      .returning();
    if (!invoice) throw new Error("Expected invoice");
    if (paid)
      await recordPayment(t.db, {
        captureId,
        status: "COMPLETED",
        paypalInvoiceId: invoice.paypalInvoiceId,
        gross: source.amount,
        fee: null,
        net: null,
        currency: source.currency,
        fxRate: null,
        createTime: receivedAt,
      });
    return invoice;
  }
  async function seed() {
    const user = await signup();
    for (const line of lines.slice(0, 3)) {
      await ledger(
        user.id,
        line,
        line.position,
        line.position === 3 ? "SYNTHETIC-OTHER" : line.reference,
      );
    }
    return user;
  }
  async function uploaded(cookie: string, body = bytes) {
    const response = await upload(cookie, body);
    expect(response.status).toBe(201);
    return firaDocumentSchema.parse(await response.json());
  }
  async function invoiceList(cookie: string) {
    const response = await app.request("/invoices", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    return z.array(invoiceViewSchema).parse(await response.json());
  }
  function suggestion(doc: z.infer<typeof firaDocumentSchema>) {
    const line = doc.lines.find((line) => line.match?.state === "needs_confirmation");
    if (!line) throw new Error("Expected suggestion");
    return line;
  }

  it("enforces authentication, PDF type, consent, size and storage in order", async () => {
    expect((await upload("")).status).toBe(401);
    expect((await app.request("/fira")).status).toBe(401);
    expect((await post("", `/fira/lines/${randomUUID()}/confirm`)).status).toBe(401);
    const user = await signup();
    for (const [headers, status, error] of [
      [{ "Content-Type": "multipart/form-data" }, 415, "unsupported_media_type"],
      [{ "Content-Type": "application/pdfx" }, 415, "unsupported_media_type"],
      [{ "X-Niryat-Consent": "" }, 400, "consent_required"],
    ] as const) {
      const response = await upload(user.cookie, bytes, headers);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    }
    const large = await upload(user.cookie, new Uint8Array(2 * 1024 * 1024 + 1));
    expect(large.status).toBe(413);
    expect(await large.json()).toEqual({ error: "file_too_large" });
    delete deps.files;
    app = createApp(deps);
    const unavailable = await upload(user.cookie);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "file_storage_unavailable" });
    expect(objects.size).toBe(0);
  });

  it("uploads four source lines with exact, suggested and absent matches and keeps the PDF private", async () => {
    const user = await seed();
    const doc = await uploaded(user.cookie);
    expect(doc.month).toBe("2026-10-01");
    expect(
      doc.lines.map((line) => line.match && [line.match.confidence, line.match.state]),
    ).toEqual([["1.00", "matched"], ["1.00", "matched"], ["0.70", "needs_confirmation"], null]);
    expect(doc.lines.map(({ id, match, note, ...line }) => line)).toEqual(lines);
    expect(doc.lines[3]?.note).toBe(
      "No PayPal payment in your ledger matches this amount and currency within 7 days of 2026-10-26.",
    );
    const key = `fira/${user.id}/${doc.id}.pdf`;
    expect(objects.get(key)).toEqual(bytes);
    expect(deps.files?.put).toHaveBeenCalledExactlyOnceWith(
      key,
      expect.any(Uint8Array),
      "application/pdf",
    );
    const listing = await app.request("/fira", { headers: { Cookie: user.cookie } });
    expect(z.array(firaDocumentSchema).parse(await listing.json())).toEqual([doc]);
    const duplicate = await upload(user.cookie);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "fira_duplicate" });
    expect(await t.db.select().from(firaDocuments)).toHaveLength(1);
    expect(objects.size).toBe(1);
  });

  it("rejects non-PDF, corrupt PDF and PDFs with no recognisable lines without writing", async () => {
    const user = await signup();
    for (const body of [
      new TextEncoder().encode("invalid"),
      new TextEncoder().encode("%PDF-invalid"),
      await pdfBytes("No FIRA lines"),
    ]) {
      const response = await upload(user.cookie, body);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "fira_unreadable" });
    }
    expect(objects.size).toBe(0);
    expect(await t.db.select().from(firaDocuments)).toEqual([]);
    expect(await t.db.select().from(firaLines)).toEqual([]);
    expect(await t.db.select().from(matches)).toEqual([]);
  });

  it.each([false, true])(
    "serializes concurrent uploads before selecting payments or writing files (duplicate: %s)",
    async (duplicate) => {
      const user = await seed();
      const second = duplicate ? bytes : await pdfBytes(`${fixture}\nAnother synthetic document`);
      const release = Promise.withResolvers<void>();
      const files = deps.files;
      if (!files) throw new Error("Expected test storage");
      vi.mocked(files.put).mockImplementation(async (key, body) => {
        objects.set(key, body);
        await release.promise;
      });
      const uploading = Promise.all([upload(user.cookie), upload(user.cookie, second)]);
      try {
        await vi.waitFor(async () => {
          const waiters = await t.db.execute(`select 1 from pg_locks
            where locktype = 'advisory' and not granted
            and database = (select oid from pg_database where datname = current_database())`);
          expect(waiters.rowCount).toBeGreaterThan(0);
          expect(objects.size).toBe(1);
        });
      } finally {
        release.resolve();
        await uploading;
      }
      const responses = await uploading;
      expect(responses.map((response) => response.status).sort()).toEqual(
        duplicate ? [201, 409] : [201, 201],
      );
      const saved = await t.db.select().from(firaDocuments);
      expect(saved).toHaveLength(duplicate ? 1 : 2);
      expect([...objects.keys()].sort()).toEqual(saved.map((doc) => doc.fileUrl).sort());
      expect(await t.db.select().from(matches)).toHaveLength(3);
      if (duplicate) {
        const rejected = responses.find((response) => response.status === 409);
        expect(await rejected?.json()).toEqual({ error: "fira_duplicate" });
      } else {
        const documents = await Promise.all(
          responses.map(async (response) => firaDocumentSchema.parse(await response.json())),
        );
        expect(
          documents.map((doc) => doc.lines.filter((line) => line.match !== null).length).sort(),
        ).toEqual([0, 3]);
      }
    },
  );

  it("confirms a suggestion once, validates decisions and isolates user records", async () => {
    const a = await seed();
    const doc = await uploaded(a.cookie);
    const line = suggestion(doc);
    const b = await signup("fira-b@example.com");
    expect((await post(b.cookie, `/fira/lines/${line.id}/confirm`)).status).toBe(404);
    expect((await post(b.cookie, `/fira/lines/${line.id}/reject`)).status).toBe(404);
    const listing = await app.request("/fira", { headers: { Cookie: b.cookie } });
    expect(await listing.json()).toEqual([]);
    expect(await firaCandidates(t.db, b.id)).toEqual([]);
    expect((await post(a.cookie, "/fira/lines/invalid/confirm")).status).toBe(404);
    expect((await post(a.cookie, `/fira/lines/${randomUUID()}/confirm`)).status).toBe(404);
    expect((await post(a.cookie, `/fira/lines/${line.id}/confirm`, { extra: true })).status).toBe(
      400,
    );
    expect(
      (
        await app.request(`/fira/lines/${line.id}/confirm`, {
          method: "POST",
          headers: { Cookie: a.cookie, "Content-Type": "text/plain" },
          body: "{}",
        })
      ).status,
    ).toBe(415);
    const confirmed = await post(a.cookie, `/fira/lines/${line.id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(
      firaDocumentSchema.parse(await confirmed.json()).lines.find((row) => row.id === line.id)
        ?.match?.state,
    ).toBe("matched");
    for (const decision of ["confirm", "reject"]) {
      const repeat = await post(a.cookie, `/fira/lines/${line.id}/${decision}`);
      expect(repeat.status).toBe(409);
      expect(await repeat.json()).toEqual({ error: "no_suggestion" });
    }
    const exact = doc.lines[0];
    if (!exact) throw new Error("Expected exact match");
    expect((await post(a.cookie, `/fira/lines/${exact.id}/reject`)).status).toBe(409);
    expect((await invoiceList(a.cookie)).every((invoice) => invoice.firaStatus === "matched")).toBe(
      true,
    );
  });

  it("rejects suggestions, releases the payment and flags its covered invoice missing", async () => {
    const user = await seed();
    const line = suggestion(await uploaded(user.cookie));
    const rejected = await post(user.cookie, `/fira/lines/${line.id}/reject`);
    expect(rejected.status).toBe(200);
    const saved = firaDocumentSchema
      .parse(await rejected.json())
      .lines.find((row) => row.id === line.id);
    expect(saved?.match).toBeNull();
    expect(saved?.note).toBe("You rejected the suggested match.");
    expect((await post(user.cookie, `/fira/lines/${line.id}/reject`)).status).toBe(409);
    expect((await firaCandidates(t.db, user.id)).map((row) => row.paymentId)).toEqual([
      line.match?.paymentId,
    ]);
    expect(
      (await invoiceList(user.cookie)).find((invoice) => invoice.id === line.match?.invoiceId)
        ?.firaStatus,
    ).toBe("missing");
  });

  it("computes invoice status using covered line months and IST payment months", async () => {
    const user = await seed();
    const first = lines[0];
    if (!first) throw new Error("Expected fixture line");
    const boundary = await ledger(user.id, first, 4, "SYNTHETIC-BOUNDARY", "2026-09-30T18:30:00Z");
    const uncovered = await ledger(
      user.id,
      first,
      5,
      "SYNTHETIC-SEPTEMBER",
      "2026-09-30T18:29:59Z",
    );
    const unpaid = await ledger(user.id, first, 6, "SYNTHETIC-UNPAID", undefined, false);
    expect(
      (await firaCandidates(t.db, user.id)).find((row) => row.paypalTxnId === "SYNTHETIC-BOUNDARY")
        ?.receivedDate,
    ).toBe("2026-10-01");
    const doc = await uploaded(user.cookie);
    const rows = await invoiceList(user.cookie);
    expect(rows.find((row) => row.id === boundary.id)?.firaStatus).toBe("missing");
    expect(rows.find((row) => row.id === uncovered.id)?.firaStatus).toBe("pending");
    expect(rows.find((row) => row.id === unpaid.id)?.firaStatus).toBe("pending");
    expect(rows.find((row) => row.id === doc.lines[0]?.match?.invoiceId)?.firaStatus).toBe(
      "matched",
    );
    const suggested = rows.find((row) => row.id === suggestion(doc).match?.invoiceId);
    expect(suggested?.firaStatus).toBe("pending");
    expect(suggested?.payments[0]?.fira).toEqual({
      lineId: suggestion(doc).id,
      confidence: "0.70",
      state: "needs_confirmation",
    });
    expect(rows.find((row) => row.id === boundary.id)?.payments[0]?.fira).toBeNull();
  });

  it("does not offer matched or suggested payments to a second document, or match refunds and unlinked payments", async () => {
    const user = await seed();
    await uploaded(user.cookie);
    await recordPayment(t.db, {
      captureId: "SYNTHETIC-UNLINKED",
      status: "COMPLETED",
      paypalInvoiceId: null,
      gross: "90.00",
      fee: null,
      net: null,
      currency: "USD",
      fxRate: null,
      createTime: "2026-10-26T12:00:00Z",
    });
    await recordRefund(t.db, {
      refundId: "SYNTHETIC-REFUND",
      status: "COMPLETED",
      captureId: "SYNTHETIC-REF-001",
      paypalInvoiceId: null,
      gross: "90.00",
      fee: null,
      net: null,
      currency: "USD",
      createTime: "2026-10-26T12:00:00Z",
    });
    expect(await firaCandidates(t.db, user.id)).toEqual([]);
    const second = await uploaded(
      user.cookie,
      await pdfBytes(`${fixture}\nAnother synthetic document`),
    );
    expect(second.lines.every((line) => line.match === null)).toBe(true);
    expect(await t.db.select().from(matches)).toHaveLength(3);
  });
});
