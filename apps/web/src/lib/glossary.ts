export const glossary = {
  lut: {
    term: "LUT, form RFD-11",
    plain:
      "A yearly form that lets a GST-registered exporter bill foreign clients without charging GST.",
    who: "your CA",
  },
  fira: {
    term: "FIRA",
    plain: "A document from PayPal or your bank that proves foreign money reached you.",
    who: "your bank",
  },
  gstr1: {
    term: "GSTR-1",
    plain: "Your GST sales return, where exports go in Table 6A.",
    who: "your CA",
  },
  purpose_code: {
    term: "RBI purpose code",
    plain:
      "A bank-confirmed code that tells the RBI what a foreign payment was for, such as software work.",
    who: "your bank",
  },
  realisation: {
    term: "RBI payment deadline (realisation)",
    plain: "The date by which money for an export invoice must reach India.",
    who: "you",
  },
  sac: {
    term: "SAC",
    plain: "A code that identifies the type of service on your GST invoice.",
    who: "your CA",
  },
  credit_note: {
    term: "Credit note",
    plain: "A document that adjusts an earlier invoice, including when you refund a payment.",
    who: "you",
  },
  advance_tax: {
    term: "Advance tax",
    plain: "Income tax you pay during the year using an estimate of your tax for that year.",
    who: "you",
  },
  presumptive: {
    term: "Presumptive taxation",
    plain:
      "A simpler way to calculate taxable income for eligible taxpayers, subject to profession and receipt limits.",
    who: "your CA",
  },
  gstin: {
    term: "GSTIN",
    plain: "The identification number you receive when you register for GST.",
    who: "you",
  },
  export_conditions: {
    term: "Export of services conditions",
    plain:
      "Five checks on your location, your client's location, place of supply, permitted payment currency and whether both parties are establishments of one person.",
    who: "your CA",
  },
} as const satisfies Record<
  string,
  { term: string; plain: string; who: "you" | "your CA" | "your bank" }
>;

export type TermId = keyof typeof glossary;
