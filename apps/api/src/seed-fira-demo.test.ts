import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentActions,
  clients,
  createUser,
  invoices,
  listClients,
  listInvoices,
  payments,
} from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { firaDocumentSchema, invoiceViewSchema } from "@niryat/shared";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseFiraText } from "./fira";
import { createApp } from "./index";
import { main, seedFiraDemo } from "./seed-fira-demo";

const fixtureUrl = new URL("./fixtures/fira-synthetic.txt", import.meta.url);
const fixture = readFileSync(fixtureUrl, "utf8");
const parsed = parseFiraText(fixture);
if (!parsed.ok) throw new Error("Invalid synthetic fixture");
const lines = parsed.lines;

describe("FIRA demo CLI validation", () => {
  beforeEach(() => {
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://unused:unused@localhost/unused");
  });
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects missing or invalid arguments without echoing their values", async () => {
    await main(["--email", "private-invalid-value"]);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Invalid arguments: email, file. Use --email <demo account> --file <path>.",
    );
    expect(process.loadEnvFile).not.toHaveBeenCalled();
  });

  it("rejects missing DATABASE_URL without connecting", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await main(["--email", "demo@example.com", "--file", "unused.pdf"]);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "FIRA demo seed failed; check DATABASE_URL",
    );
  });

  it.each(["missing-fira-demo.pdf", fileURLToPath(fixtureUrl)])(
    "rejects an unreadable file without connecting (%s)",
    async (file) => {
      await main(["--", "--email", "demo@example.com", "--file", file]);
      expect(process.exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledExactlyOnceWith("Could not read FIRA lines");
    },
  );
});

describe.skipIf(!testDatabaseUrl)("FIRA demo seed", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let bytes: Uint8Array<ArrayBuffer>;
  let directory: string;
  let file: string;
  beforeAll(async () => {
    t = await openTestDb();
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([1000, 800]);
    fixture
      .trim()
      .split(/\r?\n/)
      .forEach((row, index) => {
        page.drawText(row, { x: 30, y: 760 - index * 20, size: 10, font });
      });
    bytes = new Uint8Array(await pdf.save());
    directory = await mkdtemp(join(tmpdir(), "niryat-fira-demo-"));
    file = join(directory, "synthetic.pdf");
    await writeFile(file, bytes);
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await t?.close();
    if (file) await unlink(file);
    if (directory) await rmdir(directory);
  });

  async function user() {
    const saved = await createUser(t.db, { email: "demo@example.com", passwordHash: "unused" });
    if (!saved) throw new Error("Expected user");
    return saved;
  }

  it("mirrors all but the flagged line as paid invoices with no PDF or action", async () => {
    const account = await user();
    expect(await seedFiraDemo(t.db, account.id, lines)).toEqual({
      ok: true,
      invoices: 3,
      flaggedLine: 4,
    });
    const saved = (await listInvoices(t.db, account.id)).toReversed();
    expect(saved).toHaveLength(3);
    for (const [index, invoice] of saved.entries()) {
      const line = lines[index];
      if (!line) throw new Error("Expected fixture line");
      expect(invoice).toMatchObject({
        type: "one_time",
        status: "paid",
        pdfUrl: null,
        action: null,
        number: `2026-27/000${index + 1}`,
        fy: "2026-27",
        date: line.date,
        currency: line.currency,
        amount: line.amount,
        description: `Demo invoice mirroring FIRA line ${line.position}`,
        sac: "998314",
        paidTotal: line.amount,
        payments: [
          {
            paypalTxnId: index === 0 ? "DEMO-1" : line.reference,
            gross: line.amount,
            fee: null,
            net: null,
            receivedAt: index === 0 ? "2026-10-07T06:30:00.000Z" : `${line.date}T06:30:00.000Z`,
          },
        ],
      });
    }
    expect(await t.db.select().from(payments)).toHaveLength(3);
    expect(await t.db.select().from(agentActions)).toEqual([]);
    const demoClients = await listClients(t.db, account.id, randomBytes(32));
    expect(demoClients).toMatchObject([
      {
        name: "FIRA demo client",
        country: "US",
        exportCheck: {
          answers: {
            supplierInIndia: true,
            clientPresentInIndia: false,
            paidInForeignCurrency: true,
            sameEstablishment: false,
          },
          result: { eligible: true },
        },
      },
    ]);
    expect(await seedFiraDemo(t.db, account.id, lines)).toEqual({
      ok: false,
      reason: "has_invoices",
    });
    expect(await t.db.select().from(clients)).toHaveLength(1);
    expect(await t.db.select().from(invoices)).toHaveLength(3);
    expect(await t.db.select().from(payments)).toHaveLength(3);
  });

  it("refuses zero lines without writing and flags a single line without mirroring it", async () => {
    const account = await user();
    expect(await seedFiraDemo(t.db, account.id, [])).toEqual({ ok: false, reason: "no_lines" });
    expect(await t.db.select().from(clients)).toEqual([]);
    expect(await seedFiraDemo(t.db, account.id, lines.slice(0, 1))).toEqual({
      ok: true,
      invoices: 0,
      flaggedLine: 1,
    });
    expect(await t.db.select().from(invoices)).toEqual([]);
    expect(await t.db.select().from(payments)).toEqual([]);
  });

  it.each([
    { amount: "875.25", currency: "CHF" },
    { amount: "1000000000000.00", currency: "USD" },
    { amount: "1000000000.00", currency: "USD" },
    { amount: "0.00", currency: "USD" },
  ])("rejects unreadable invoice values before writing ($amount $currency)", async (invalid) => {
    const account = await user();
    const source = parseFiraText(
      fixture.replace("875.25 USD", `${invalid.amount} ${invalid.currency}`),
    );
    if (!source.ok) throw new Error("Expected parser to accept fixture variant");
    const transaction = vi.spyOn(t.db, "transaction");
    expect(await seedFiraDemo(t.db, account.id, source.lines)).toEqual({
      ok: false,
      reason: "invalid_lines",
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(await t.db.select().from(clients)).toEqual([]);
    expect(await t.db.select().from(invoices)).toEqual([]);
    expect(await t.db.select().from(payments)).toEqual([]);
    expect(await t.db.select().from(agentActions)).toEqual([]);
    expect(await seedFiraDemo(t.db, account.id, lines)).toEqual({
      ok: true,
      invoices: 3,
      flaggedLine: 4,
    });
    expect(await listInvoices(t.db, account.id)).toHaveLength(3);
  });

  it("accepts the invoice amount limit and leaves the final line unvalidated", async () => {
    const account = await user();
    const source = parseFiraText(
      fixture
        .replace("875.25 USD", "999,999,999.99 CAD")
        .replace("90.00 USD", "1,000,000,000,000.00 CHF"),
    );
    if (!source.ok) throw new Error("Expected parser to accept fixture variant");
    expect(await seedFiraDemo(t.db, account.id, source.lines)).toEqual({
      ok: true,
      invoices: 3,
      flaggedLine: 4,
    });
    expect(await listInvoices(t.db, account.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: "999999999.99", currency: "CAD" }),
      ]),
    );
  });

  it("allocates a separate consecutive sequence per financial year", async () => {
    const account = await user();
    await seedFiraDemo(
      t.db,
      account.id,
      lines.map((line, index) => ({
        ...line,
        date: ["2027-03-31", "2027-04-01", "2027-03-30", "2027-04-02"][index] ?? line.date,
      })),
    );
    expect(
      (await listInvoices(t.db, account.id)).map(({ fy, number }) => ({ fy, number })),
    ).toEqual([
      { fy: "2027-28", number: "2027-28/0001" },
      { fy: "2026-27", number: "2026-27/0002" },
      { fy: "2026-27", number: "2026-27/0001" },
    ]);
  });

  it("serializes concurrent seeds and refuses an existing invoice owned by this user", async () => {
    const account = await user();
    const results = await Promise.all([
      seedFiraDemo(t.db, account.id, lines),
      seedFiraDemo(t.db, account.id, lines),
    ]);
    expect(results).toContainEqual({ ok: true, invoices: 3, flaggedLine: 4 });
    expect(results).toContainEqual({ ok: false, reason: "has_invoices" });
    expect(await t.db.select().from(clients)).toHaveLength(1);
    expect(await t.db.select().from(invoices)).toHaveLength(3);
  });

  it("rolls back the entire ledger on a payment conflict without exposing its reference", async () => {
    const account = await user();
    await expect(
      seedFiraDemo(
        t.db,
        account.id,
        lines.map((line) => ({ ...line, reference: "DEMO-1" })),
      ),
    ).rejects.toThrow("Demo ledger save failed");
    expect(await t.db.select().from(clients)).toEqual([]);
    expect(await t.db.select().from(invoices)).toEqual([]);
    expect(await t.db.select().from(payments)).toEqual([]);
  });

  it("uploads the fixture with one suggestion, two exact matches and one flagged line", async () => {
    const objects = new Map<string, Uint8Array>();
    const app = createApp({
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: "x".repeat(32),
      secureCookies: false,
      files: {
        put: async (key, body) => {
          objects.set(key, body);
        },
        get: async (key) => objects.get(key),
      },
    });
    const signup = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "demo@example.com", password: "correct-horse-battery" }),
    });
    expect(signup.status).toBe(201);
    const account = z.object({ id: z.uuid() }).parse(await signup.json());
    const cookie = signup.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected cookie");
    await seedFiraDemo(t.db, account.id, lines);
    const response = await app.request("/fira", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/pdf",
        "X-Niryat-Consent": "own-fira",
      },
      body: bytes,
    });
    expect(response.status).toBe(201);
    const document = firaDocumentSchema.parse(await response.json());
    expect(
      document.lines.map(
        ({ match }) => match && { state: match.state, confidence: match.confidence },
      ),
    ).toEqual([
      { state: "needs_confirmation", confidence: "0.70" },
      { state: "matched", confidence: "1.00" },
      { state: "matched", confidence: "1.00" },
      null,
    ]);
    expect(document.lines.at(-1)?.note).toMatch(/^No PayPal payment/);
    const invoiceResponse = await app.request("/invoices", { headers: { Cookie: cookie } });
    expect(invoiceResponse.status).toBe(200);
    expect(
      z
        .array(invoiceViewSchema)
        .parse(await invoiceResponse.json())
        .map((invoice) => invoice.pdfUrl),
    ).toEqual([null, null, null]);
  });

  it("CLI prints only counts and reports missing or nonempty accounts", async () => {
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("DATABASE_URL", testDatabaseUrl);
    const args = ["--email", "demo@example.com", "--file", relative(resolve("../.."), file)];
    await main(args);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenLastCalledWith("No account with that email");
    await user();
    process.exitCode = 0;
    await main(args);
    expect(process.exitCode).toBe(0);
    expect(console.log).toHaveBeenCalledExactlyOnceWith('{"invoices":3,"flaggedLine":4}');
    await main(args);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenLastCalledWith(
      "The demo seed needs an account with no invoices",
    );
  });
});
