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
  uuid,
} from "drizzle-orm/pg-core";

// Structural stubs from PLAN section 13. No migrations or domain behavior yet.
// gstin and pan_last4 hold AES-GCM ciphertext (see encryption.ts).
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
  gstRegistered: boolean("gst_registered"),
  gstin: text("gstin"),
  lutNumber: text("lut_number"),
  lutValidFrom: date("lut_valid_from"),
  lutValidTo: date("lut_valid_to"),
  workType: text("work_type"),
  purposeCode: text("purpose_code"),
  panLast4: text("pan_last4"),
});
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  name: text("name"),
  address: text("address"),
  country: text("country"),
  email: text("email"),
  exportCheckResult: jsonb("export_check_result"),
});
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  clientId: uuid("client_id").references(() => clients.id),
  type: text("type"),
  number: text("number"),
  fy: text("fy"),
  date: date("date"),
  currency: text("currency"),
  amount: numeric("amount"),
  description: text("description"),
  paypalInvoiceId: text("paypal_invoice_id"),
  paypalRecurringSeriesId: text("paypal_recurring_series_id"),
  pdfUrl: text("pdf_url"),
  status: text("status"),
});
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  paypalTxnId: text("paypal_txn_id"),
  kind: text("kind"),
  gross: numeric("gross"),
  fee: numeric("fee"),
  net: numeric("net"),
  currency: text("currency"),
  fxRate: numeric("fx_rate"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
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
  userId: uuid("user_id").references(() => users.id),
  paypalAction: text("paypal_action"),
  payload: jsonb("payload"),
  status: text("status"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
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
