import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUser,
  decideFiraMatch,
  firaCandidates,
  firaDocumentExists,
  firaDocuments,
  firaLines,
  firaStatusFor,
  listFiraDocuments,
  matches,
  saveFiraDocument,
} from "./index";
import { openTestDb, testDatabaseUrl } from "./testing";

describe("invoice FIRA status", () => {
  const covered = new Set(["2026-10"]);
  const payment = (state: "matched" | "needs_confirmation" | null, receivedMonth = "2026-10") => ({
    fira: state === null ? null : { state },
    receivedMonth,
  });
  it.each([
    { name: "unpaid", payments: [], expected: "pending" },
    {
      name: "all matched",
      payments: [payment("matched"), payment("matched")],
      expected: "matched",
    },
    { name: "uncovered match", payments: [payment("matched", "2026-09")], expected: "matched" },
    { name: "uncovered payment", payments: [payment(null, "2026-09")], expected: "pending" },
    { name: "covered payment", payments: [payment(null)], expected: "missing" },
    { name: "suggestion", payments: [payment("needs_confirmation")], expected: "pending" },
    {
      name: "mixed suggestions",
      payments: [payment("matched"), payment("needs_confirmation")],
      expected: "pending",
    },
    { name: "some missing", payments: [payment("matched"), payment(null)], expected: "missing" },
    {
      name: "missing and suggestion",
      payments: [payment("needs_confirmation"), payment(null)],
      expected: "missing",
    },
  ])("$name → $expected", ({ payments, expected }) => {
    expect(firaStatusFor(payments, covered)).toBe(expected);
  });
});

describe.skipIf(!testDatabaseUrl)("FIRA storage", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function user(email = "fira@example.com") {
    const result = await createUser(t.db, { email, passwordHash: "test-hash" });
    if (!result) throw new Error("Expected test user");
    return result.id;
  }
  function document() {
    return {
      id: randomUUID(),
      sha256: "a".repeat(64),
      fileKey: "fira/test.pdf",
      month: "2026-10-01",
      parsedAt: new Date(),
      lines: [
        {
          position: 1,
          date: "2026-10-05",
          amount: "100.00",
          currency: "USD",
          reference: "SYNTHETIC",
          purposeCode: null,
          sourceText: "Synthetic source",
          paymentId: null,
          confidence: null,
          note: null,
        },
      ],
    };
  }

  it("saves atomically, deduplicates concurrent uploads per user and scopes reads", async () => {
    const a = await user();
    const b = await user("other@example.com");
    const { lines, ...doc } = document();
    const finalize = vi.fn(async () => lines);
    expect(await firaDocumentExists(t.db, a, doc.sha256)).toBe(false);
    const results = await Promise.all([
      saveFiraDocument(t.db, a, doc, finalize),
      saveFiraDocument(t.db, a, { ...doc, id: randomUUID() }, finalize),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([{ ok: true }, { ok: false, reason: "duplicate" }]),
    );
    expect(finalize).toHaveBeenCalledExactlyOnceWith([]);
    expect(await firaDocumentExists(t.db, a, doc.sha256)).toBe(true);
    expect(await firaDocumentExists(t.db, b, doc.sha256)).toBe(false);
    expect(await listFiraDocuments(t.db, a)).toHaveLength(1);
    expect(await listFiraDocuments(t.db, b)).toEqual([]);
    expect(await firaCandidates(t.db, b)).toEqual([]);
    expect(await t.db.select().from(firaLines)).toHaveLength(1);
    expect(await saveFiraDocument(t.db, b, { ...doc, id: randomUUID() }, finalize)).toEqual({
      ok: true,
    });
  });

  it("rolls back all document and line writes when a match cannot be saved", async () => {
    const a = await user();
    const { lines, ...doc } = document();
    await expect(
      saveFiraDocument(t.db, a, doc, async () =>
        lines.map((line) => ({ ...line, paymentId: randomUUID(), confidence: "0.70" })),
      ),
    ).rejects.toThrow("FIRA save failed");
    expect(await t.db.select().from(firaDocuments)).toEqual([]);
    expect(await t.db.select().from(firaLines)).toEqual([]);
    expect(await t.db.select().from(matches)).toEqual([]);
  });

  it("returns typed outcomes for absent lines and lines without suggestions", async () => {
    const a = await user();
    const b = await user("other@example.com");
    expect(await decideFiraMatch(t.db, a, randomUUID(), "confirm")).toEqual({
      ok: false,
      reason: "not_found",
    });
    const { lines, ...doc } = document();
    await saveFiraDocument(t.db, a, doc, async () => lines);
    const line = (await listFiraDocuments(t.db, a))[0]?.lines[0];
    if (!line) throw new Error("Expected a line");
    expect(await decideFiraMatch(t.db, a, line.id, "confirm")).toEqual({
      ok: false,
      reason: "no_suggestion",
    });
    expect(await decideFiraMatch(t.db, b, line.id, "reject")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
