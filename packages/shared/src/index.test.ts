import { expect, it } from "vitest";
import {
  actionSchema,
  actionStatusSchema,
  agentRunKinds,
  agentRunSchema,
  clientInputSchema,
  closePageSchema,
  closeSummarySchema,
  credentialsSchema,
  disputeSchema,
  exportCheckResultSchema,
  exportConditionIds,
  firaDocumentSchema,
  firaLineSchema,
  firaMatchSchema,
  gstr1PeriodSchema,
  identifierSchema,
  inrRateSchema,
  invoiceBlockedSchema,
  invoiceInputSchema,
  invoiceSchema,
  invoiceViewSchema,
  profileInputSchema,
  rbiDeadlineSchema,
  recurrenceSchema,
  refundInputSchema,
  refundSchema,
  reminderActionSchema,
  reminderStageSchema,
  taskSchema,
  toolCallSchema,
} from "./index";

it("validates agent run months and tool-call actors and JSON", () => {
  const run = {
    id: "40000000-0000-4000-8000-000000000001",
    kind: "monthly_close",
    trigger: "manual",
    month: "2026-10",
    asOf: "2026-10-30",
    status: "running",
    error: null,
    startedAt: "2026-10-30T12:00:00Z",
    finishedAt: null,
    summary: null,
    toolCalls: [],
  };
  expect(agentRunSchema.parse(run)).toEqual(run);
  expect(agentRunKinds).toContain("dashboard");
  expect(agentRunSchema.parse({ ...run, kind: "dashboard" }).kind).toBe("dashboard");
  expect(agentRunSchema.safeParse({ ...run, month: "2026-13" }).success).toBe(false);
  const call = {
    seq: 1,
    actor: "agent",
    tool: "read",
    input: {},
    output: { count: 1 },
    ok: true,
    createdAt: run.startedAt,
  };
  expect(toolCallSchema.parse(call)).toEqual(call);
  expect(toolCallSchema.safeParse({ ...call, actor: "model" }).success).toBe(false);
  expect(toolCallSchema.safeParse({ ...call, seq: 0 }).success).toBe(false);
  expect(toolCallSchema.safeParse({ ...call, output: undefined }).success).toBe(false);
});

it("validates close summaries and reminder actions for the approval queue", () => {
  const id = "40000000-0000-4000-8000-000000000001";
  const summary = {
    month: "2026-10",
    asOf: "2026-10-30",
    payments: { count: 1, totals: [{ currency: "USD", gross: "100.00", fee: null, net: null }] },
    refunds: { count: 0, totals: [] },
    openDisputes: 0,
    fira: { state: "not_due", needsConfirmation: 0, unmatched: 0 },
    deadlines: [
      {
        invoiceId: id,
        invoiceNumber: "2026-27/0001",
        deadline: "2026-12-01",
        daysRemaining: 32,
        stage: 60,
        overdue: false,
      },
    ],
    proposals: [
      {
        actionId: id,
        invoiceNumber: "2026-27/0001",
        stage: 60,
        advice: { advice: "hold", reason: "Review the dispute" },
      },
    ],
    suggestedTasks: 0,
    tasksCreated: 0,
    focus: [],
    sync: { payments: "done", disputes: "skipped" },
    ai: { status: "used", costUsd: "0.10" },
    note: null,
    citations: [],
  };
  expect(closeSummarySchema.parse(summary)).toEqual(summary);
  expect(closeSummarySchema.safeParse({ ...summary, month: "2026-13" }).success).toBe(false);
  const action = {
    id,
    invoiceId: id,
    invoiceNumber: "2026-27/0001",
    paymentId: null,
    paypalAction: "send_invoice_reminder",
    status: "proposed",
    payload: {},
    error: null,
    createdAt: "2026-10-30T12:00:00Z",
  };
  expect(reminderActionSchema.parse(action)).toEqual(action);
  expect(actionSchema.safeParse(action).success).toBe(true);
  expect(closePageSchema.parse({ runs: [], approvals: [action] }).approvals).toEqual([action]);
  expect(reminderStageSchema.safeParse(45).success).toBe(false);
  const deadline = {
    deadline: "2026-12-01",
    daysRemaining: 32,
    stage: 60,
    overdue: false,
    uncertainWindow: false,
    message: "Test",
    citation: { ruleId: "RBI_REALISATION", source: "Test", effectiveFrom: null },
  };
  expect(rbiDeadlineSchema.parse(deadline)).toEqual(deadline);
  expect(rbiDeadlineSchema.safeParse({ ...deadline, deadline: "2026-02-30" }).success).toBe(false);
});

it("rejects empty identifiers at the boundary", () => {
  expect(identifierSchema.safeParse("  ").success).toBe(false);
  expect(identifierSchema.parse(" example ")).toBe("example");
});

const profile = {
  legalName: "Ananya Rao",
  address: "12 MG Road, Pune 411001",
  gstRegistered: true,
  gstin: "27ABCDE1234F1Z5",
  lutNumber: "LUT-1",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
  workType: "Software development",
  purposeCode: "P0802",
  panLast4: "234F",
  expectedTurnoverInr: 1_800_000,
};

it("accepts valid credentials and normalizes email", () => {
  expect(
    credentialsSchema.parse({ email: " Freelancer@Example.com ", password: "long-password" }),
  ).toEqual({ email: "freelancer@example.com", password: "long-password" });
});

it.each([11, 129])("rejects a password of %i characters", (length) => {
  expect(
    credentialsSchema.safeParse({ email: "freelancer@example.com", password: "x".repeat(length) })
      .success,
  ).toBe(false);
});

it("accepts a complete profile and normalizes its fields", () => {
  const expected = { ...profile, gstr1Frequency: null, specifiedProfession: null };
  expect(profileInputSchema.parse(profile)).toEqual(expected);
  expect(
    profileInputSchema.parse({
      ...profile,
      legalName: " Ananya Rao ",
      address: " 12 MG Road, Pune 411001 ",
      gstin: " 27abcde1234f1z5 ",
      purposeCode: " p0802 ",
      panLast4: " 234f ",
    }),
  ).toEqual(expected);
});

it.each([
  { gstr1Frequency: "monthly", specifiedProfession: true },
  { gstr1Frequency: "quarterly", specifiedProfession: false },
  { gstr1Frequency: null, specifiedProfession: null },
])("accepts profile report answers $gstr1Frequency / $specifiedProfession", (answers) => {
  expect(profileInputSchema.parse({ ...profile, ...answers })).toEqual({ ...profile, ...answers });
});

it("accepts an incomplete profile with nullable fields", () => {
  const incomplete = {
    legalName: null,
    address: null,
    gstRegistered: false,
    gstin: null,
    lutNumber: null,
    lutValidFrom: null,
    lutValidTo: null,
    workType: null,
    purposeCode: null,
    panLast4: null,
    expectedTurnoverInr: null,
  };
  expect(profileInputSchema.parse(incomplete)).toEqual({
    ...incomplete,
    gstr1Frequency: null,
    specifiedProfession: null,
  });
});

it.each([
  { field: "gstin", value: "27ABCDE1234F1Z" },
  { field: "purposeCode", value: "P080" },
  { field: "lutValidTo", value: "2026-03-31" },
  { field: "expectedTurnoverInr", value: -1 },
  { field: "expectedTurnoverInr", value: 1.5 },
  { field: "gstr1Frequency", value: "annual" },
  { field: "specifiedProfession", value: "yes" },
])("rejects an invalid $field and identifies its path", ({ field, value }) => {
  const result = profileInputSchema.safeParse({ ...profile, [field]: value });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual([field]);
  }
});

it.each(["1", "83.125", "0.0001", "9999.9999", "0001.0000"])(
  "accepts INR rate %s without converting it",
  (rate) => {
    expect(inrRateSchema.parse(rate)).toBe(rate);
  },
);

it.each([
  "0",
  "0.0000",
  "0000.0000",
  "-1",
  "+1",
  "1e2",
  " 83",
  "83 ",
  "83\n",
  ".5",
  "1.",
  "10000",
  "1.12345",
  "",
  83,
  null,
])("rejects an invalid INR rate (%s)", (rate) => {
  expect(inrRateSchema.safeParse(rate).success).toBe(false);
});

it.each(["2026-10", "2026-01", "2026-12", "2026-27-Q1", "2026-27-Q3", "2026-27-Q4"])(
  "accepts GSTR-1 period %s",
  (period) => {
    expect(gstr1PeriodSchema.parse(period)).toBe(period);
  },
);

it.each([
  "2026-00",
  "2026-13",
  "2026-1",
  "2026-27-Q0",
  "2026-27-Q5",
  "2026-Q3",
  "2026-2027-Q3",
  "2026-27-q3",
  "2026-10-01",
  " 2026-10",
  "2026-10\n",
  "",
  2026,
])("rejects an invalid GSTR-1 period (%s)", (period) => {
  expect(gstr1PeriodSchema.safeParse(period).success).toBe(false);
});

const client = {
  name: " Acme ",
  country: " us ",
  answers: {
    supplierInIndia: null,
    clientPresentInIndia: null,
    paidInForeignCurrency: null,
    sameEstablishment: null,
  },
};

it("normalizes a client name and country with all answers null", () => {
  expect(clientInputSchema.parse(client)).toEqual({
    ...client,
    name: "Acme",
    country: "US",
    email: null,
    address: null,
  });
});

it("normalizes client email and address", () => {
  expect(
    clientInputSchema.parse({ ...client, email: " A@B.COM ", address: " 12 Main Street " }),
  ).toMatchObject({ email: "a@b.com", address: "12 Main Street" });
});

it("rejects a three-letter country and identifies its path", () => {
  const result = clientInputSchema.safeParse({ ...client, country: "USA" });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["country"]);
  }
});

const invoice = {
  clientId: "10000000-0000-4000-8000-000000000001",
  type: "one_time",
  description: "Software development",
  sac: "998314",
  currency: "USD",
  amount: "100.00",
};
const recurrence = { intervalUnit: "MONTH", intervalCount: 1, totalCycles: 2 };

it("defaults one-time recurrence to null and accepts a recurring invoice", () => {
  expect(invoiceInputSchema.parse(invoice)).toEqual({ ...invoice, recurrence: null });
  const recurring = { ...invoice, type: "recurring", recurrence };
  expect(invoiceInputSchema.parse(recurring)).toEqual(recurring);
});

it.each([
  { type: "recurring", recurrence: null },
  { type: "recurring" },
  { type: "one_time", recurrence },
])("rejects mismatched recurrence for $type", (fields) => {
  const result = invoiceInputSchema.safeParse({ ...invoice, ...fields });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["recurrence"]);
  }
});

it.each(["100", "100.5", "0.01", "999999999.99"])("preserves decimal amount %s", (amount) => {
  expect(invoiceInputSchema.parse({ ...invoice, amount }).amount).toBe(amount);
});

it.each([
  { field: "amount", value: "0" },
  { field: "amount", value: "0.00" },
  { field: "amount", value: "-1" },
  { field: "amount", value: "1.234" },
  { field: "amount", value: "1e3" },
  { field: "amount", value: 100 },
  { field: "amount", value: "1000000000" },
  { field: "currency", value: "INR" },
  { field: "sac", value: "99831" },
  { field: "description", value: "Design ₹" },
])("rejects invalid invoice $field: $value", ({ field, value }) => {
  const result = invoiceInputSchema.safeParse({ ...invoice, [field]: value });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual([field]);
  }
});

it.each(["9983", "998314", "99831400"])("accepts SAC %s and printable accented text", (sac) => {
  expect(invoiceInputSchema.parse({ ...invoice, sac, description: "Café design" })).toMatchObject({
    sac,
    description: "Café design",
  });
});

it.each([
  { intervalUnit: "DAY" },
  { intervalCount: 0 },
  { intervalCount: 13 },
  { intervalCount: 1.5 },
  { totalCycles: 0 },
  { totalCycles: 37 },
])("rejects unsupported recurrence %j", (fields) => {
  expect(recurrenceSchema.safeParse({ ...recurrence, ...fields }).success).toBe(false);
});

it.each([
  { field: "legalName", value: undefined },
  { field: "address", value: undefined },
  { field: "legalName", value: " " },
  { field: "address", value: " " },
  { field: "legalName", value: "₹" },
  { field: "address", value: "₹" },
  { field: "legalName", value: "a".repeat(201) },
  { field: "address", value: "a".repeat(501) },
])("rejects invalid profile $field", ({ field, value }) => {
  expect(profileInputSchema.safeParse({ ...profile, [field]: value }).success).toBe(false);
});

it.each([{ name: "₹" }, { address: "₹" }, { email: "invalid" }])(
  "rejects unsupported client fields %j",
  (fields) => {
    expect(clientInputSchema.safeParse({ ...client, ...fields }).success).toBe(false);
  },
);

it("accepts failed actions and rejects automatic approval", () => {
  expect(actionStatusSchema.parse("failed")).toBe("failed");
  expect(actionStatusSchema.safeParse("auto-approved").success).toBe(false);
});

it("validates invoice responses with payments and an action", () => {
  const response = {
    ...invoice,
    id: "20000000-0000-4000-8000-000000000001",
    clientName: "Acme Inc",
    number: "2026-27/0001",
    fy: "2026-27",
    date: "2026-10-26",
    recurrence: null,
    status: "paid",
    pdfUrl: "/api/files/test-token",
    paypalInvoiceId: "INV2-test",
    paypalRecurringSeriesId: null,
    paidTotal: "100.00",
    firaStatus: "pending",
    refundedTotal: "0",
    refunds: [],
    disputes: [],
    refundActions: [],
    payments: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        paypalTxnId: "test-capture",
        gross: "100.00",
        fee: null,
        net: null,
        currency: "USD",
        fxRate: null,
        receivedAt: "2026-10-26T12:00:00Z",
        fira: null,
      },
    ],
    action: {
      id: "40000000-0000-4000-8000-000000000001",
      paypalAction: "send_invoice",
      paymentId: null,
      status: "done",
      payload: { detail: { invoice_number: "2026-27/0001" } },
      error: null,
      createdAt: "2026-10-26T11:00:00Z",
    },
  };
  expect(invoiceSchema.parse(response)).toEqual(response);
  for (const status of ["partially_refunded", "refunded"]) {
    expect(invoiceSchema.parse({ ...response, status }).status).toBe(status);
  }
  const citation = { ruleId: "REALISATION_ADJUSTMENT", source: "Test source", effectiveFrom: null };
  const compliance = {
    deadline: null,
    realisation: {
      exportValue: "100.00",
      received: "60.00",
      shortfall: "40.00",
      adjustment: "pending_bank",
      message: "Test realisation message",
      citation,
    },
    creditNotes: [
      {
        refundId: "test-refund",
        originalInvoice: response.number,
        originalDate: response.date,
        value: "USD 40.00",
        igst: "USD 0.00",
        declareBy: "2027-11-30",
        late: false,
        message: "Test credit-note message",
        citation: { ...citation, ruleId: "CREDIT_NOTE" },
      },
    ],
    disputeAlerts: [
      { paypalDisputeId: "test-dispute", lost: false, message: "Test alert", citation },
    ],
  };
  expect(invoiceViewSchema.parse({ ...response, compliance })).toEqual({ ...response, compliance });
  expect(invoiceViewSchema.safeParse(response).success).toBe(false);
  expect(
    invoiceViewSchema.safeParse({
      ...response,
      compliance: { ...compliance, realisation: { ...compliance.realisation, received: "60" } },
    }).success,
  ).toBe(false);
  expect(invoiceSchema.safeParse({ ...response, status: "unknown" }).success).toBe(false);
  expect(
    invoiceSchema.safeParse({ ...response, payments: [{ ...response.payments[0], gross: 100 }] })
      .success,
  ).toBe(false);
});

it("accepts refund amounts as positive decimal strings only, without extra keys", () => {
  expect(refundInputSchema.parse({ amount: "40" })).toEqual({ amount: "40" });
  for (const input of [{ amount: "0" }, { amount: 40 }, { amount: "40", currency: "USD" }]) {
    expect(refundInputSchema.safeParse(input).success).toBe(false);
  }
});

it("validates refund and dispute responses with nullable PayPal fields", () => {
  const refund = {
    id: "30000000-0000-4000-8000-000000000001",
    paypalTxnId: "test-refund",
    captureId: null,
    gross: "40.00",
    fee: null,
    net: null,
    currency: "USD",
    receivedAt: "2026-10-27T12:00:00Z",
  };
  expect(refundSchema.parse(refund)).toEqual(refund);
  expect(refundSchema.safeParse({ ...refund, gross: 40 }).success).toBe(false);
  const dispute = {
    id: refund.id,
    paypalDisputeId: "test-dispute",
    amount: "40.00",
    currency: "USD",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    status: "OPEN",
    stage: null,
    outcome: null,
    responseDueDate: null,
  };
  expect(disputeSchema.parse(dispute)).toEqual(dispute);
  expect(disputeSchema.safeParse({ ...dispute, responseDueDate: "tomorrow" }).success).toBe(false);
});

it("rejects unknown task types and statuses", () => {
  const task = {
    id: "40000000-0000-4000-8000-000000000001",
    type: "refund_recorded",
    status: "open",
    message: "Test task",
    dueDate: null,
    invoiceId: null,
    sourceRuleId: "CREDIT_NOTE",
    createdAt: "2026-10-27T12:00:00Z",
    doneAt: null,
  };
  expect(taskSchema.parse(task)).toEqual(task);
  expect(taskSchema.safeParse({ ...task, type: "other" }).success).toBe(false);
  expect(taskSchema.safeParse({ ...task, status: "closed" }).success).toBe(false);
});

it("accepts nullable FIRA fields and requires a supported match state", () => {
  const line = {
    id: "50000000-0000-4000-8000-000000000001",
    position: 1,
    date: "2026-10-26",
    amount: "100.00",
    currency: "USD",
    reference: "test-reference",
    purposeCode: null,
    sourceText: "Synthetic FIRA line",
    note: null,
    match: null,
  };
  expect(firaLineSchema.parse(line)).toEqual(line);
  const match = {
    paymentId: "30000000-0000-4000-8000-000000000001",
    paypalTxnId: "test-capture",
    invoiceId: "20000000-0000-4000-8000-000000000001",
    invoiceNumber: "2026-27/0001",
    confidence: "0.70",
    state: "needs_confirmation",
  };
  expect(firaLineSchema.parse({ ...line, match }).match).toEqual(match);
  expect(firaMatchSchema.safeParse({ ...match, state: "auto" }).success).toBe(false);
  const document = {
    id: "60000000-0000-4000-8000-000000000001",
    month: "2026-10-01",
    uploadedAt: "2026-10-27T12:00:00Z",
    lines: [line],
  };
  expect(firaDocumentSchema.parse(document)).toEqual(document);
  expect(firaDocumentSchema.safeParse({ ...document, month: "2026-10-02" }).success).toBe(false);
});

it("requires at least one invoice-blocked reason", () => {
  const blocked = { error: "invoice_blocked", reasons: ["Complete your compliance profile."] };
  expect(invoiceBlockedSchema.parse(blocked)).toEqual(blocked);
  expect(invoiceBlockedSchema.safeParse({ ...blocked, reasons: [] }).success).toBe(false);
});

it("strips userId from a client body", () => {
  expect(
    clientInputSchema.parse({ ...client, userId: "00000000-0000-4000-8000-000000000001" }),
  ).not.toHaveProperty("userId");
});

it("rejects an export check with four conditions instead of five", () => {
  const check = {
    eligible: true,
    conditions: exportConditionIds.map((id) => ({
      id,
      status: "pass",
      reference: "Test reference",
      message: "Test message",
    })),
    citation: { ruleId: "EXPORT_CONDITIONS", source: "Test source", effectiveFrom: null },
    checkedOn: "2026-10-26",
  };
  expect(exportCheckResultSchema.safeParse(check).success).toBe(true);
  const result = exportCheckResultSchema.safeParse({
    ...check,
    conditions: check.conditions.slice(0, 4),
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["conditions"]);
  }
});
