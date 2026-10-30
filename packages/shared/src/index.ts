import { z } from "zod";

// Placeholder boundary shared by future APIs. Domain schemas arrive with their specs.
export const identifierSchema = z.string().trim().min(1);
export type Identifier = z.infer<typeof identifierSchema>;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12).max(128),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const PDF_TEXT_PATTERN = /^[\x20-\x7E\u00A0-\u00FF\n]*$/;

export const profileInputSchema = z
  .object({
    legalName: z.string().trim().min(1).max(200).regex(PDF_TEXT_PATTERN).nullable(),
    address: z.string().trim().min(1).max(500).regex(PDF_TEXT_PATTERN).nullable(),
    gstRegistered: z.boolean(),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9A-Z]{15}$/)
      .nullable(),
    lutNumber: z.string().trim().min(1).max(64).nullable(),
    lutValidFrom: z.iso.date().nullable(),
    lutValidTo: z.iso.date().nullable(),
    workType: z.string().trim().min(1).max(200).nullable(),
    purposeCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^P\d{4}$/)
      .nullable(),
    panLast4: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9A-Z]{4}$/)
      .nullable(),
    expectedTurnoverInr: z.number().int().min(0).max(2_000_000_000).nullable(),
  })
  .refine((p) => !p.lutValidFrom || !p.lutValidTo || p.lutValidFrom <= p.lutValidTo, {
    path: ["lutValidTo"],
    message: "lutValidTo must not be before lutValidFrom",
  });
export type ProfileInput = z.infer<typeof profileInputSchema>;

// Phase 2 contracts. Response schemas let apps/web validate API JSON.
export const CA_NOTE = "Verify with your CA.";
export const BANK_NOTE = "Confirm the code with your bank before changing it in PayPal.";

export const ruleCitationSchema = z.object({
  ruleId: z.string(),
  source: z.string(),
  effectiveFrom: z.iso.date().nullable(),
});
export type RuleCitation = z.infer<typeof ruleCitationSchema>;

export const healthFlagCodes = [
  "lut_missing",
  "lut_not_started",
  "lut_expired",
  "lut_expiring",
  "gstin_missing",
  "turnover_missing",
  "gst_threshold_exceeded",
  "gst_threshold_near",
  "purpose_code_missing",
  "purpose_code_goods_or_travel",
  "purpose_code_not_offered",
  "purpose_code_mismatch",
  "work_type_missing",
] as const;
export const healthFlagSchema = z.object({
  code: z.enum(healthFlagCodes),
  severity: z.enum(["high", "medium", "low"]),
  message: z.string(),
  citation: ruleCitationSchema,
  note: z.literal(CA_NOTE),
});
export type HealthFlag = z.infer<typeof healthFlagSchema>;

export const purposeCodeSuggestionSchema = z.object({
  code: z.string().nullable(),
  label: z.string().nullable(),
  reason: z.string(),
  note: z.literal(BANK_NOTE),
});
export type PurposeCodeSuggestion = z.infer<typeof purposeCodeSuggestionSchema>;

export const healthReportSchema = z.object({
  score: z.number().int().min(0).max(100),
  flags: z.array(healthFlagSchema),
  suggestion: purposeCodeSuggestionSchema.nullable(),
  checkedOn: z.iso.date(),
});
export type HealthReport = z.infer<typeof healthReportSchema>;

export const purposeCodeEntrySchema = z.object({
  code: z.string().regex(/^P\d{4}$/),
  paypalLabel: z.string(),
  annexDescription: z.string(),
  suggest: z.enum(["yes", "rarely", "never"]),
});
export type PurposeCodeEntry = z.infer<typeof purposeCodeEntrySchema>;
export const purposeCodesResponseSchema = z.object({
  citation: ruleCitationSchema,
  codes: z.array(purposeCodeEntrySchema),
});

export const exportAnswersSchema = z.object({
  supplierInIndia: z.boolean().nullable(),
  clientPresentInIndia: z.boolean().nullable(),
  paidInForeignCurrency: z.boolean().nullable(),
  sameEstablishment: z.boolean().nullable(),
});
export type ExportAnswers = z.infer<typeof exportAnswersSchema>;
export const clientInputSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(PDF_TEXT_PATTERN),
  email: z.string().trim().toLowerCase().pipe(z.email()).nullable().default(null),
  address: z.string().trim().min(1).max(500).regex(PDF_TEXT_PATTERN).nullable().default(null),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  answers: exportAnswersSchema,
});
export type ClientInput = z.infer<typeof clientInputSchema>;

export const exportConditionIds = [
  "supplier_in_india",
  "recipient_outside_india",
  "place_of_supply_outside_india",
  "foreign_exchange",
  "not_same_person",
] as const;
export const exportConditionSchema = z.object({
  id: z.enum(exportConditionIds),
  status: z.enum(["pass", "fail", "unknown"]),
  reference: z.string(),
  message: z.string(),
});
export const exportCheckResultSchema = z.object({
  eligible: z.boolean(),
  conditions: z.array(exportConditionSchema).length(5),
  citation: ruleCitationSchema,
  checkedOn: z.iso.date(),
});
export type ExportCheckResult = z.infer<typeof exportCheckResultSchema>;
export const storedExportCheckSchema = z.object({
  answers: exportAnswersSchema,
  result: exportCheckResultSchema,
});
export type StoredExportCheck = z.infer<typeof storedExportCheckSchema>;
export const clientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  country: z.string(),
  exportCheck: storedExportCheckSchema,
});
export type Client = z.infer<typeof clientSchema>;

export const actionStatusSchema = z.enum(["proposed", "approved", "rejected", "done", "failed"]);
export type ActionStatus = z.infer<typeof actionStatusSchema>;
export const paypalActionNames = [
  "send_invoice",
  "create_recurring_series",
  "refund_payment",
] as const;
export const invoiceCurrencies = ["USD", "EUR", "GBP", "AUD", "CAD"] as const;

export const recurrenceSchema = z.object({
  intervalUnit: z.enum(["WEEK", "MONTH", "YEAR"]),
  intervalCount: z.number().int().min(1).max(12),
  totalCycles: z.number().int().min(1).max(36),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const invoiceInputSchema = z
  .object({
    clientId: z.uuid(),
    type: z.enum(["one_time", "recurring"]),
    description: z.string().trim().min(1).max(200).regex(PDF_TEXT_PATTERN),
    sac: z.string().regex(/^\d{4}(\d{2})?(\d{2})?$/),
    currency: z.enum(invoiceCurrencies),
    amount: z
      .string()
      .regex(/^\d{1,9}(\.\d{1,2})?$/)
      .refine((amount) => /[1-9]/.test(amount)),
    recurrence: recurrenceSchema.nullable().default(null),
  })
  .refine((invoice) => (invoice.type === "recurring") === (invoice.recurrence !== null), {
    path: ["recurrence"],
    message: "recurrence is required only for recurring invoices",
  });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const refundInputSchema = z.strictObject({ amount: invoiceInputSchema.shape.amount });
export type RefundInput = z.infer<typeof refundInputSchema>;

export const firaStatuses = ["matched", "pending", "missing"] as const;
export type FiraStatus = (typeof firaStatuses)[number];

export const paymentSchema = z.object({
  id: z.uuid(),
  paypalTxnId: z.string(),
  gross: z.string(),
  fee: z.string().nullable(),
  net: z.string().nullable(),
  currency: z.string(),
  fxRate: z.string().nullable(),
  receivedAt: z.iso.datetime(),
  fira: z
    .object({
      lineId: z.uuid(),
      confidence: z.string(),
      state: z.enum(["matched", "needs_confirmation"]),
    })
    .nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const refundSchema = z.object({
  id: z.uuid(),
  paypalTxnId: z.string(),
  captureId: z.string().nullable(),
  gross: z.string(),
  fee: z.string().nullable(),
  net: z.string().nullable(),
  currency: z.string(),
  receivedAt: z.iso.datetime(),
});
export type Refund = z.infer<typeof refundSchema>;

export const disputeSchema = z.object({
  id: z.uuid(),
  paypalDisputeId: z.string(),
  amount: z.string(),
  currency: z.string(),
  reason: z.string(),
  status: z.string(),
  stage: z.string().nullable(),
  outcome: z.string().nullable(),
  responseDueDate: z.iso.date().nullable(),
});
export type Dispute = z.infer<typeof disputeSchema>;

export const realisationSchema = z.object({
  exportValue: z.string().regex(/^\d+\.\d{2}$/),
  received: z.string().regex(/^\d+\.\d{2}$/),
  shortfall: z.string().regex(/^\d+\.\d{2}$/),
  adjustment: z.enum(["none", "pending_bank"]),
  message: z.string().nullable(),
  citation: ruleCitationSchema,
});
export type Realisation = z.infer<typeof realisationSchema>;

export const creditNoteSchema = z.object({
  refundId: z.string(),
  originalInvoice: z.string(),
  originalDate: z.iso.date(),
  value: z.string(),
  igst: z.string(),
  declareBy: z.iso.date(),
  late: z.boolean(),
  message: z.string(),
  citation: ruleCitationSchema,
});
export type CreditNote = z.infer<typeof creditNoteSchema>;

export const disputeAlertSchema = z.object({
  paypalDisputeId: z.string(),
  lost: z.boolean(),
  message: z.string(),
  citation: ruleCitationSchema,
});
export type DisputeAlert = z.infer<typeof disputeAlertSchema>;

export const reminderStages = [60, 30] as const;
export const reminderStageSchema = z.union([z.literal(60), z.literal(30)]);
export const rbiDeadlineSchema = z.object({
  deadline: z.iso.date(),
  daysRemaining: z.int(),
  stage: reminderStageSchema.nullable(),
  overdue: z.boolean(),
  uncertainWindow: z.boolean(),
  message: z.string(),
  citation: ruleCitationSchema,
});

export const complianceSchema = z.object({
  realisation: realisationSchema,
  deadline: rbiDeadlineSchema.nullable(),
  creditNotes: z.array(creditNoteSchema),
  disputeAlerts: z.array(disputeAlertSchema),
});
export type Compliance = z.infer<typeof complianceSchema>;

export const actionSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid().nullable(),
  paypalAction: z.enum(paypalActionNames),
  status: actionStatusSchema,
  payload: z.record(z.string(), z.unknown()),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Action = z.infer<typeof actionSchema>;

export const invoiceStatuses = [
  "issued",
  "sent",
  "partially_paid",
  "paid",
  "partially_refunded",
  "refunded",
] as const;
export const invoiceSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string(),
  type: z.enum(["one_time", "recurring"]),
  number: z.string(),
  fy: z.string(),
  date: z.iso.date(),
  currency: z.enum(invoiceCurrencies),
  amount: z.string(),
  description: z.string(),
  sac: z.string(),
  recurrence: recurrenceSchema.nullable(),
  status: z.enum(invoiceStatuses),
  pdfUrl: z.string().nullable(),
  paypalInvoiceId: z.string().nullable(),
  paypalRecurringSeriesId: z.string().nullable(),
  paidTotal: z.string(),
  payments: z.array(paymentSchema),
  firaStatus: z.enum(firaStatuses),
  refundedTotal: z.string(),
  refunds: z.array(refundSchema),
  disputes: z.array(disputeSchema),
  action: actionSchema.nullable(),
  refundActions: z.array(actionSchema),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceViewSchema = invoiceSchema.extend({ compliance: complianceSchema });
export type InvoiceView = z.infer<typeof invoiceViewSchema>;

export const taskTypes = [
  "refund_recorded",
  "dispute_opened",
  "dispute_lost",
  "fira_missing",
  "rbi_deadline_passed",
  "agent_suggestion",
] as const;
export const taskSchema = z.object({
  id: z.uuid(),
  type: z.enum(taskTypes),
  status: z.enum(["open", "done"]),
  message: z.string(),
  dueDate: z.iso.date().nullable(),
  invoiceId: z.uuid().nullable(),
  sourceRuleId: z.string(),
  createdAt: z.iso.datetime(),
  doneAt: z.iso.datetime().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const agentRunKinds = ["monthly_close", "reminders", "extraction"] as const;
export type AgentRunKind = (typeof agentRunKinds)[number];
export const agentRunTriggers = ["manual", "scheduled", "nightly"] as const;
export type AgentRunTrigger = (typeof agentRunTriggers)[number];
export const aiStatuses = ["used", "unavailable", "budget_exhausted", "failed"] as const;
export type AiStatus = (typeof aiStatuses)[number];
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const agentAdviceSchema = z.object({
  advice: z.enum(["send", "hold"]),
  reason: z.string(),
});
export const toolCallSchema = z.object({
  seq: z.int().min(1),
  actor: z.enum(["agent", "system"]),
  tool: z.string(),
  input: z.json(),
  output: z.json(),
  ok: z.boolean(),
  createdAt: z.iso.datetime(),
});
export const currencyTotalSchema = z.object({
  currency: z.string(),
  gross: z.string(),
  fee: z.string().nullable(),
  net: z.string().nullable(),
});
export type CurrencyTotal = z.infer<typeof currencyTotalSchema>;
export const closeSummarySchema = z.object({
  month: monthSchema,
  asOf: z.iso.date(),
  payments: z.object({ count: z.int().nonnegative(), totals: z.array(currencyTotalSchema) }),
  refunds: z.object({
    count: z.int().nonnegative(),
    totals: z.array(currencyTotalSchema.pick({ currency: true, gross: true })),
  }),
  openDisputes: z.int().nonnegative(),
  fira: z.object({
    state: z.enum(["covered", "missing", "not_due", "not_needed"]),
    needsConfirmation: z.int().nonnegative(),
    unmatched: z.int().nonnegative(),
  }),
  deadlines: z.array(
    z.object({
      invoiceId: z.uuid(),
      invoiceNumber: z.string(),
      deadline: z.iso.date(),
      daysRemaining: z.int(),
      stage: reminderStageSchema.nullable(),
      overdue: z.boolean(),
    }),
  ),
  proposals: z.array(
    z.object({
      actionId: z.uuid(),
      invoiceNumber: z.string(),
      stage: reminderStageSchema,
      advice: agentAdviceSchema.nullable(),
    }),
  ),
  suggestedTasks: z.int().nonnegative(),
  tasksCreated: z.int().nonnegative(),
  focus: z.array(z.object({ label: z.string(), reason: z.string() })),
  sync: z.object({
    payments: z.enum(["done", "skipped", "failed"]),
    disputes: z.enum(["done", "skipped", "failed"]),
  }),
  ai: z.object({ status: z.enum(aiStatuses), costUsd: z.string() }),
  note: z.string().nullable(),
  citations: z.array(ruleCitationSchema),
});
export type CloseSummary = z.infer<typeof closeSummarySchema>;
export const agentRunSchema = z.object({
  id: z.uuid(),
  kind: z.enum(agentRunKinds),
  trigger: z.enum(agentRunTriggers),
  month: monthSchema,
  asOf: z.iso.date(),
  status: z.enum(["running", "completed", "failed"]),
  error: z.string().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  summary: closeSummarySchema.nullable(),
  toolCalls: z.array(toolCallSchema),
});
export type AgentRun = z.infer<typeof agentRunSchema>;
export const reminderActionSchema = actionSchema.extend({
  paypalAction: z.literal("send_invoice_reminder"),
  invoiceId: z.uuid(),
  invoiceNumber: z.string(),
});
export type ReminderAction = z.infer<typeof reminderActionSchema>;
export const closePageSchema = z.object({
  runs: z.array(agentRunSchema),
  approvals: z.array(reminderActionSchema),
});

export const firaMatchSchema = z.object({
  paymentId: z.uuid(),
  paypalTxnId: z.string(),
  invoiceId: z.uuid(),
  invoiceNumber: z.string(),
  confidence: z.string(),
  state: z.enum(["matched", "needs_confirmation"]),
});
export type FiraMatch = z.infer<typeof firaMatchSchema>;

export const firaLineSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  date: z.iso.date(),
  amount: z.string(),
  currency: z.string(),
  reference: z.string(),
  purposeCode: z.string().nullable(),
  sourceText: z.string(),
  note: z.string().nullable(),
  match: firaMatchSchema.nullable(),
});
export type FiraLine = z.infer<typeof firaLineSchema>;

export const firaDocumentSchema = z.object({
  id: z.uuid(),
  month: z.iso.date().regex(/-01$/),
  uploadedAt: z.iso.datetime(),
  lines: z.array(firaLineSchema),
});
export type FiraDocument = z.infer<typeof firaDocumentSchema>;

export const invoiceBlockedSchema = z.object({
  error: z.literal("invoice_blocked"),
  reasons: z.array(z.string()).min(1),
});
