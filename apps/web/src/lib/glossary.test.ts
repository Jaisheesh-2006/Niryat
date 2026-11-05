import { expect, it } from "vitest";
import { glossary } from "./glossary";

it.each(Object.entries(glossary))(
  "defines plain wording and responsibility for %s",
  (_id, entry) => {
    expect(entry.term.trim()).not.toBe("");
    expect(entry.plain.trim()).not.toBe("");
    expect(["you", "your CA", "your bank"]).toContain(entry.who);
  },
);

it("covers every planned term", () => {
  expect(Object.keys(glossary)).toEqual([
    "lut",
    "fira",
    "gstr1",
    "purpose_code",
    "realisation",
    "sac",
    "credit_note",
    "advance_tax",
    "presumptive",
    "gstin",
    "export_conditions",
  ]);
});
