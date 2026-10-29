import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractPdfText,
  FIRA_AUTO_MATCH_CONFIDENCE,
  FIRA_DATE_WINDOW_DAYS,
  type FiraCandidate,
  matchFiraLines,
  type ParsedFiraLine,
  parseFiraText,
} from "./fira";

const fixture = readFileSync(new URL("./fixtures/fira-synthetic.txt", import.meta.url), "utf8");
const line: ParsedFiraLine = {
  position: 1,
  date: "2026-10-05",
  amount: "1234.56",
  currency: "USD",
  reference: "SYNTHETIC-REF-001",
  purposeCode: "P0802",
  sourceText: "1 05-Oct-2026 1,234.56 USD SYNTHETIC-REF-001 P0802 Not shown",
};
const candidate: FiraCandidate = {
  paymentId: "payment-1",
  paypalTxnId: "SYNTHETIC-REF-001",
  gross: "1234.56",
  net: null,
  currency: "USD",
  receivedDate: "2026-10-05",
};
const expectedLines: ParsedFiraLine[] = [
  line,
  {
    position: 2,
    date: "2026-10-12",
    amount: "250.00",
    currency: "USD",
    reference: "SYNTHETIC-REF-002",
    purposeCode: "P0802",
    sourceText: "2 12-Oct-2026 250.00 USD SYNTHETIC-REF-002 P0802 Not shown",
  },
  {
    position: 3,
    date: "2026-10-19",
    amount: "875.25",
    currency: "USD",
    reference: "SYNTHETIC-REF-003",
    purposeCode: "P0802",
    sourceText: "3 19-Oct-2026 875.25 USD SYNTHETIC-REF-003 P0802 Not shown",
  },
  {
    position: 4,
    date: "2026-10-26",
    amount: "90.00",
    currency: "USD",
    reference: "SYNTHETIC-REF-004",
    purposeCode: "P0802",
    sourceText: "4 26-Oct-2026 90.00 USD SYNTHETIC-REF-004 P0802 Not shown",
  },
];

describe("synthetic FIRA parser", () => {
  it("extracts the exact four lines in document order", () => {
    expect(parseFiraText(fixture)).toEqual({ ok: true, lines: expectedLines });
  });

  it.each([
    ["missing middle row", fixture.replace(/^2 .*$/m, "")],
    ["missing final row", fixture.replace(/^4 .*$/m, "")],
    ["early table terminator", fixture.replace(/^2 .*$/m, "Layout notes")],
  ])("rejects incomplete statements: %s", (_name, text) => {
    expect(parseFiraText(text)).toEqual({ ok: false });
  });

  it.each(["", "Remittance lines: invalid", "Remittance lines: 0", "Remittance lines: 5"])(
    "rejects a missing, invalid or mismatched declared count (%#)",
    (count) => {
      expect(parseFiraText(fixture.replace("Remittance lines: 4", count))).toEqual({ ok: false });
    },
  );

  it.each(["", "Unrecognised layout", fixture.replace(/^[1-4] .*\n/gm, "")])(
    "rejects text without recognisable lines (%#)",
    (text) => expect(parseFiraText(text)).toEqual({ ok: false }),
  );

  it.each([
    ["250.00", "garbled"],
    ["250.00", "-250.00"],
    ["250.00", "25,0.00"],
    ["250.00", "250.001"],
    ["12-Oct-2026", "31-Feb-2026"],
    ["12-Oct-2026", "12-Bad-2026"],
    ["12-Oct-2026 ", ""],
    ["250.00 ", ""],
    ["250.00 USD ", "250.00 "],
    ["USD SYNTHETIC-REF-002", "ZZZ SYNTHETIC-REF-002"],
    ["SYNTHETIC-REF-002 ", ""],
    ["SYNTHETIC-REF-002 P0802", "SYNTHETIC-REF-002 invalid"],
    ["2 12-Oct-2026", "bad 12-Oct-2026"],
  ])("rejects the whole document for a malformed row (%#)", (before, after) => {
    expect(parseFiraText(fixture.replace(before, after))).toEqual({ ok: false });
  });

  it.each([
    ["000250", "250.00"],
    ["250.5", "250.50"],
    ["0", "0.00"],
  ])("normalises decimal strings without numeric conversion (%#)", (amount, expected) => {
    const result = parseFiraText(fixture.replace("250.00", amount));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lines[1]?.amount).toBe(expected);
  });

  it("keeps an omitted purpose code nullable", () => {
    const result = parseFiraText(fixture.replace("SYNTHETIC-REF-002 P0802", "SYNTHETIC-REF-002"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lines[1]?.purposeCode).toBeNull();
  });

  it("round trips the fixture through PDF text extraction", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([1000, 800]);
    fixture
      .trim()
      .split("\n")
      .forEach((text, index) => {
        page.drawText(text, { x: 30, y: 760 - index * 20, size: 10, font });
      });
    expect(parseFiraText(await extractPdfText(await pdf.save()))).toEqual(parseFiraText(fixture));
  });

  it("rejects malformed PDFs with an error containing no input values", async () => {
    await expect(
      extractPdfText(new TextEncoder().encode("private malformed input")),
    ).rejects.toThrow(/^Could not extract PDF text$/);
  });

  it("rejects a PDF without a text layer", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    expect(parseFiraText(await extractPdfText(await pdf.save()))).toEqual({ ok: false });
  });
});

describe("FIRA matching", () => {
  it("exports the planned heuristic constants", () => {
    expect(FIRA_DATE_WINDOW_DAYS).toBe(7);
    expect(FIRA_AUTO_MATCH_CONFIDENCE).toBe("0.90");
  });

  it("accepts an exact reference regardless of the date gap", () => {
    expect(matchFiraLines([line], [{ ...candidate, receivedDate: "2026-09-01" }])).toEqual([
      { position: 1, paymentId: "payment-1", confidence: "1.00", note: null },
    ]);
  });

  it.each([{ gross: "999.00" }, { currency: "EUR" }])(
    "flags a reference match with a different amount or currency (%#)",
    (change) => {
      expect(matchFiraLines([line], [{ ...candidate, ...change }])).toEqual([
        {
          position: 1,
          paymentId: "payment-1",
          confidence: "0.60",
          note: "Reference matches, but the amount or currency differs from the PayPal payment.",
        },
      ]);
    },
  );

  it("compares against net and normalises money strings", () => {
    expect(
      matchFiraLines(
        [line],
        [
          {
            ...candidate,
            paypalTxnId: "OTHER",
            gross: "1300",
            net: "001234.56",
          },
        ],
      ),
    ).toEqual([
      {
        position: 1,
        paymentId: "payment-1",
        confidence: "0.70",
        note: "Matched on amount, currency and date only. Confirm this is the right payment.",
      },
    ]);
    expect(
      matchFiraLines(
        [{ ...line, amount: "250.00" }],
        [
          {
            ...candidate,
            gross: "250",
            net: null,
          },
        ],
      )[0]?.confidence,
    ).toBe("1.00");
  });

  it.each(["2026-09-27", "2026-10-13"])("rejects an eight-day gap (%#)", (receivedDate) => {
    expect(matchFiraLines([line], [{ ...candidate, paypalTxnId: "OTHER", receivedDate }])).toEqual([
      {
        position: 1,
        paymentId: null,
        confidence: null,
        note: "No PayPal payment in your ledger matches this amount and currency within 7 days of 2026-10-05.",
      },
    ]);
  });

  it.each(["2026-09-28", "2026-10-12"])("includes a seven-day gap (%#)", (receivedDate) => {
    expect(
      matchFiraLines([line], [{ ...candidate, paypalTxnId: "OTHER", receivedDate }])[0]?.confidence,
    ).toBe("0.70");
  });

  it.each([
    ["2026-10-04", "2026-10-07", "B", "A"],
    ["2026-10-04", "2026-10-06", "B", "A"],
    ["2026-10-04", "2026-10-04", "A", "B"],
  ])(
    "breaks ties by gap, date, then transaction ID (%#)",
    (firstDate, secondDate, firstId, secondId) => {
      expect(
        matchFiraLines(
          [line],
          [
            { ...candidate, paymentId: "second", paypalTxnId: secondId, receivedDate: secondDate },
            { ...candidate, paymentId: "first", paypalTxnId: firstId, receivedDate: firstDate },
          ],
        ),
      ).toEqual([
        {
          position: 1,
          paymentId: "first",
          confidence: "0.50",
          note: "2 payments match the amount, currency and date. Confirm this is the right one.",
        },
      ]);
    },
  );

  it("uses a payment only once for duplicate lines or references", () => {
    const results = matchFiraLines([line, { ...line, position: 2 }], [candidate]);
    expect(results.map((result) => result.paymentId)).toEqual(["payment-1", null]);
    expect(results[1]?.note).toBe(
      "No PayPal payment in your ledger matches this amount and currency within 7 days of 2026-10-05.",
    );
  });

  it("reserves later reference matches before any amount/date suggestion", () => {
    expect(
      matchFiraLines(
        [
          { ...line, reference: "UNKNOWN" },
          { ...line, position: 2 },
        ],
        [candidate],
      ).map((result) => result.paymentId),
    ).toEqual([null, "payment-1"]);
  });

  it("matches remaining lines in position order without mutating inputs", () => {
    const lines = [
      { ...line, position: 2, reference: "UNKNOWN" },
      { ...line, reference: "UNKNOWN" },
    ];
    const candidates = [{ ...candidate, paypalTxnId: "OTHER" }];
    const before = structuredClone({ lines, candidates });
    expect(matchFiraLines(lines, candidates).map((result) => result.paymentId)).toEqual([
      "payment-1",
      null,
    ]);
    expect({ lines, candidates }).toEqual(before);
  });

  it("rejects a currency mismatch without a reference match", () => {
    expect(
      matchFiraLines([line], [{ ...candidate, paypalTxnId: "OTHER", currency: "EUR" }])[0],
    ).toEqual({
      position: 1,
      paymentId: null,
      confidence: null,
      note: "No PayPal payment in your ledger matches this amount and currency within 7 days of 2026-10-05.",
    });
  });
});
