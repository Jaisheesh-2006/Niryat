import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Remaining structural stubs follow PLAN section 13.
// gstin, pan_last4 and addresses hold AES-GCM ciphertext (see encryption.ts).
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  paypalPayerId: text("paypal_payer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  legalName: text("legal_name"),
  address: text("address"),
  gstRegistered: boolean("gst_registered"),
  gstin: text("gstin"),
  lutNumber: text("lut_number"),
  lutValidFrom: date("lut_valid_from"),
  lutValidTo: date("lut_valid_to"),
  workType: text("work_type"),
  purposeCode: text("purpose_code"),
  panLast4: text("pan_last4"),
  expectedTurnoverInr: integer("expected_turnover_inr"),
});
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  address: text("address"),
  country: text("country").notNull(),
  email: text("email"),
  exportCheckResult: jsonb("export_check_result"),
});
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    type: text("type").notNull(),
    number: text("number").notNull(),
    fy: text("fy").notNull(),
    seq: integer("seq").notNull(),
    date: date("date").notNull(),
    currency: text("currency").notNull(),
    amount: numeric("amount").notNull(),
    description: text("description").notNull(),
    sac: text("sac").notNull(),
    recurrence: jsonb("recurrence"),
    paypalInvoiceId: text("paypal_invoice_id").unique(),
    paypalRecurringSeriesId: text("paypal_recurring_series_id").unique(),
    pdfUrl: text("pdf_url"),
    pdfToken: text("pdf_token").unique(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique().on(table.userId, table.fy, table.seq),
    unique().on(table.userId, table.number),
  ],
);
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  paypalTxnId: text("paypal_txn_id").notNull().unique(),
  kind: text("kind").notNull(),
  gross: numeric("gross").notNull(),
  fee: numeric("fee"),
  net: numeric("net"),
  currency: text("currency").notNull(),
  fxRate: numeric("fx_rate"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  paypalDisputeId: text("paypal_dispute_id"),
  amount: numeric("amount"),
  status: text("status"),
  reason: text("reason"),
  outcome: text("outcome"),
});
export const firaDocuments = pgTable("fira_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  month: date("month"),
  fileUrl: text("file_url"),
  parsedAt: timestamp("parsed_at", { withTimezone: true }),
});
export const firaLines = pgTable("fira_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  firaDocumentId: uuid("fira_document_id").references(() => firaDocuments.id),
  date: date("date"),
  amount: numeric("amount"),
  currency: text("currency"),
  reference: text("reference"),
  purposeCode: text("purpose_code"),
});
export const matches = pgTable(
  "matches",
  {
    firaLineId: uuid("fira_line_id")
      .notNull()
      .references(() => firaLines.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    confidence: numeric("confidence"),
    confirmedByUser: boolean("confirmed_by_user"),
  },
  (table) => [primaryKey({ columns: [table.firaLineId, table.paymentId] })],
);
export const agentActions = pgTable("agent_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  paypalAction: text("paypal_action").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  type: text("type"),
  dueDate: date("due_date"),
  status: text("status"),
  sourceRuleId: text("source_rule_id"),
});
export const ruleVersions = pgTable(
  "rule_versions",
  {
    ruleId: text("rule_id").notNull(),
    version: integer("version").notNull(),
    effectiveFrom: date("effective_from"),
    source: text("source"),
    review: text("review").notNull().default("unchecked"),
  },
  (table) => [primaryKey({ columns: [table.ruleId, table.version] })],
);
