import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cite } from "./cite";
import { gstr1ExportRows, gstr1Period, gstr1PeriodsDueBetween, latestClosedPeriod } from "./gstr1";
import { parseRules, RULES_FILE_URL } from "./load";

const yaml = readFileSync(RULES_FILE_URL, "utf8");
const rules = parseRules(yaml);

describe("GSTR-1 periods", () => {
  it.each([
    ["2026-10", "monthly", "2026-10-01", "2026-10-31", "2026-11-11", "October 2026"],
    [
      "2026-27-Q3",
      "quarterly",
      "2026-10-01",
      "2026-12-31",
      "2027-01-13",
      "Q3 2026-27 (October to December 2026)",
    ],
    [
      "2026-27-Q4",
      "quarterly",
      "2027-01-01",
      "2027-03-31",
      "2027-04-13",
      "Q4 2026-27 (January to March 2027)",
    ],
    [
      "2026-27-Q1",
      "quarterly",
      "2026-04-01",
      "2026-06-30",
      "2026-07-13",
      "Q1 2026-27 (April to June 2026)",
    ],
    ["2028-02", "monthly", "2028-02-01", "2028-02-29", "2028-03-11", "February 2028"],
    ["0099-12", "monthly", "0099-12-01", "0099-12-31", "0100-01-11", "December 0099"],
    [
      "2099-00-Q4",
      "quarterly",
      "2100-01-01",
      "2100-03-31",
      "2100-04-13",
      "Q4 2099-00 (January to March 2100)",
    ],
  ])("describes %s", (period, frequency, start, end, dueDate, label) => {
    expect(gstr1Period(period, rules)).toEqual({
      frequency,
      start,
      end,
      dueDate,
      label,
      citation: cite(rules, "GSTR1_6A"),
    });
  });

  it.each([
    "2026-13",
    "2026-00",
    "2026-27-Q5",
    "2026-28-Q1",
    "2026-1",
    "2026-10\n",
    "2026-27-q1",
    "",
  ])("rejects invalid period %j", (period) =>
    expect(() => gstr1Period(period, rules)).toThrow(new RangeError("Invalid period")),
  );

  it("reads due days only from YAML", () => {
    const changed = parseRules(
      yaml
        .replace("monthly_due_day: 11", "monthly_due_day: 20")
        .replace("quarterly_due_day: 13", "quarterly_due_day: 21"),
    );
    expect(gstr1Period("2026-10", changed).dueDate).toBe("2026-11-20");
    expect(gstr1Period("2026-27-Q3", changed).dueDate).toBe("2027-01-21");
    expect(gstr1PeriodsDueBetween("monthly", "2026-11-20", "2026-11-20", changed)).toEqual([
      "2026-10",
    ]);
  });

  it.each([
    undefined,
    {},
    { monthly_due_day: 11 },
    { monthly_due_day: 0, quarterly_due_day: 13 },
    { monthly_due_day: 11, quarterly_due_day: 32 },
    { monthly_due_day: 11.5, quarterly_due_day: 13 },
  ])("rejects missing/invalid params %j", (params) => {
    const changed = rules.map((rule) => (rule.id === "GSTR1_6A" ? { ...rule, params } : rule));
    expect(() => gstr1Period("2026-10", changed)).toThrow("GSTR1_6A params missing");
  });

  it.each([
    ["monthly", "2026-11-11", "2026-12-11", ["2026-10", "2026-11"]],
    ["monthly", "2026-11-12", "2026-12-10", []],
    ["quarterly", "2027-01-13", "2027-04-13", ["2026-27-Q3", "2026-27-Q4"]],
    ["quarterly", "2027-01-14", "2027-04-12", []],
    ["quarterly", "2026-04-13", "2026-04-13", ["2025-26-Q4"]],
  ] as const)("lists %s due dates inclusively: %s to %s", (frequency, from, to, expected) => {
    expect(gstr1PeriodsDueBetween(frequency, from, to, rules)).toEqual(expected);
  });

  it.each([
    ["quarterly", "2026-10-31", "2026-27-Q2"],
    ["monthly", "2026-11-01", "2026-10"],
    ["monthly", "2026-10-31", "2026-09"],
    ["quarterly", "2027-04-01", "2026-27-Q4"],
    ["quarterly", "2027-01-01", "2026-27-Q3"],
    ["monthly", "2027-01-01", "2026-12"],
    ["quarterly", "2026-04-01", "2025-26-Q4"],
  ] as const)("latest closed %s on %s", (frequency, today, expected) => {
    expect(latestClosedPeriod(frequency, today)).toBe(expected);
  });

  it.each(["2026-02-29", "2026-10-32", "2026-10-01T00:00:00Z", "2026-10-01\n", ""])(
    "rejects invalid date %j",
    (date) => {
      expect(() => latestClosedPeriod("monthly", date)).toThrow(new RangeError("Invalid period"));
      expect(() => gstr1PeriodsDueBetween("monthly", date, "2026-12-31", rules)).toThrow(
        new RangeError("Invalid period"),
      );
      expect(() => gstr1PeriodsDueBetween("quarterly", "2026-01-01", date, rules)).toThrow(
        new RangeError("Invalid period"),
      );
    },
  );

  it("rejects reversed ranges", () => {
    expect(() => gstr1PeriodsDueBetween("monthly", "2026-11-01", "2026-10-31", rules)).toThrow(
      new RangeError("Invalid period"),
    );
  });
});

const invoice = {
  invoiceId: "one",
  number: "2026-27/0001",
  date: "2026-10-15",
  amount: "100.00",
  inrRate: "84.1234",
  gstRate: "18",
};
const lut = { from: "2026-04-01", to: "2027-03-31" };

describe("GSTR-1 WOPAY export rows", () => {
  it.each(["0", "5", "12", "18", "0.25", "100"])(
    "preserves an explicit GST percentage %s without charging tax",
    (gstRate) => {
      const result = gstr1ExportRows({ invoices: [{ ...invoice, gstRate }], lut }, rules);
      expect(result).toEqual({
        rows: [
          {
            invoiceId: "one",
            number: invoice.number,
            date: invoice.date,
            exportType: "WOPAY",
            invoiceValueInr: "8412.34",
            taxableValueInr: "8412.34",
            gstRate: Number(gstRate).toFixed(2),
          },
        ],
        excluded: [],
        totalInr: "8412.34",
        citation: cite(rules, "GSTR1_6A"),
      });
    },
  );

  it.each([
    ["2026-03-31", false],
    ["2026-04-01", true],
    ["2027-03-31", true],
    ["2027-04-01", false],
  ])("LUT coverage on %s is %s", (date, covered) => {
    const result = gstr1ExportRows({ invoices: [{ ...invoice, date }], lut }, rules);
    expect(result.rows).toHaveLength(covered ? 1 : 0);
    expect(result.excluded).toEqual(
      covered
        ? []
        : [
            {
              invoiceId: "one",
              number: invoice.number,
              date,
              reason: "lut_not_valid",
              message: `Invoice ${invoice.number} is not covered by your LUT on ${date}, so it needs IGST. It is not in this file; ask your CA.`,
            },
          ],
    );
  });

  it.each([null, { from: "2025-04-01", to: "2026-03-31" }])(
    "excludes invoices without requiring rates when LUT is %j",
    (lut) => {
      const result = gstr1ExportRows(
        { invoices: [{ ...invoice, inrRate: null, gstRate: null }], lut },
        rules,
      );
      expect(result.rows).toEqual([]);
      expect(result.excluded).toHaveLength(1);
      expect(result.totalInr).toBe("0.00");
    },
  );

  it.each([null, "", "-1", "100.01", "101", "18.001", "1e1", " 18", "18\n", "84.1234"])(
    "rejects GST percentage %j without inferring a default",
    (gstRate) => {
      expect(() => gstr1ExportRows({ invoices: [{ ...invoice, gstRate }], lut }, rules)).toThrow(
        new RangeError("Invalid GST rate"),
      );
    },
  );

  it.each([null, "0", "-1", "18.00001", "10000", "84\n"])(
    "rejects INR rate %j without substituting the GST percentage",
    (inrRate) => {
      expect(() => gstr1ExportRows({ invoices: [{ ...invoice, inrRate }], lut }, rules)).toThrow(
        new RangeError("Invalid INR rate"),
      );
    },
  );

  it("sorts a copy and sums rounded row values exactly, excluding uncovered invoices", () => {
    const invoices = [
      { ...invoice, invoiceId: "two", number: "2026-27/0002", amount: "0.05", inrRate: "83.5" },
      { ...invoice },
      { ...invoice, invoiceId: "three", number: "2026-27/0003", date: "2027-04-01" },
    ];
    const before = structuredClone(invoices);
    const result = gstr1ExportRows({ invoices, lut }, rules);
    expect(result.rows.map((row) => row.number)).toEqual(["2026-27/0001", "2026-27/0002"]);
    expect(result.totalInr).toBe("8416.52");
    expect(result.excluded.map((row) => row.invoiceId)).toEqual(["three"]);
    expect(invoices).toEqual(before);
  });

  it("keeps large converted totals exact", () => {
    expect(
      gstr1ExportRows(
        { invoices: [{ ...invoice, amount: "999999999999.99", inrRate: "9999.9999" }], lut },
        rules,
      ).totalInr,
    ).toBe("9999999899999900.00");
  });

  it("sums individually rounded rows rather than rounding their combined value", () => {
    const invoices = ["one", "two"].map((invoiceId) => ({
      ...invoice,
      invoiceId,
      amount: "0.05",
      inrRate: "83.5",
    }));
    expect(gstr1ExportRows({ invoices, lut }, rules).totalInr).toBe("8.36");
  });

  it("handles an empty period", () => {
    expect(gstr1ExportRows({ invoices: [], lut }, rules)).toEqual({
      rows: [],
      excluded: [],
      totalInr: "0.00",
      citation: cite(rules, "GSTR1_6A"),
    });
  });

  it.each([
    { from: "2026-02-29", to: "2027-03-31" },
    { from: "2027-04-01", to: "2027-03-31" },
  ])("rejects invalid LUT bounds", (lut) => {
    expect(() => gstr1ExportRows({ invoices: [invoice], lut }, rules)).toThrow(
      new RangeError("Invalid period"),
    );
  });

  it("rejects invalid invoice dates even without a LUT", () => {
    expect(() =>
      gstr1ExportRows({ invoices: [{ ...invoice, date: "2026-02-29" }], lut: null }, rules),
    ).toThrow(new RangeError("Invalid period"));
  });

  it("rejects invalid invoice fields and duplicate IDs", () => {
    for (const invoices of [
      [{ ...invoice, number: "invalid,number" }],
      [{ ...invoice, number: "2026-27/0001\n" }],
      [invoice, invoice],
    ]) {
      expect(() => gstr1ExportRows({ invoices, lut }, rules)).toThrow(
        new RangeError("Invalid invoices"),
      );
    }
    expect(() => gstr1ExportRows({ invoices: [{ ...invoice, amount: "-1" }], lut }, rules)).toThrow(
      new RangeError("Invalid amount"),
    );
  });
});
