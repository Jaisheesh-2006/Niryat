interface InvoiceParty {
  legalName: string;
  gstin?: string | null;
  clientName: string;
  clientEmail: string;
}

type InvoiceInput = InvoiceParty & {
  number: string;
  date: string;
  currency: string;
  amount: string;
  description: string;
  note: string;
  terms?: string;
};

function invoiceBody(i: InvoiceInput) {
  return {
    detail: {
      currency_code: i.currency,
      note: i.note,
      ...(i.terms === undefined ? {} : { terms_and_conditions: i.terms }),
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    invoicer: {
      business_name: i.legalName,
      ...(i.gstin == null ? {} : { tax_id: i.gstin }),
    },
    primary_recipients: [
      { billing_info: { email_address: i.clientEmail, business_name: i.clientName } },
    ],
    items: [
      {
        name: i.description,
        quantity: "1",
        unit_amount: { currency_code: i.currency, value: i.amount },
      },
    ],
  };
}

export function buildInvoiceRequest(i: InvoiceInput): Record<string, unknown> {
  const body = invoiceBody(i);
  return {
    ...body,
    detail: { ...body.detail, invoice_number: i.number, invoice_date: i.date },
  };
}

export function buildSendRequest(i: { subject: string }): Record<string, unknown> {
  return { subject: i.subject, send_to_recipient: true, send_to_invoicer: false };
}

export function buildSeriesRequest(
  i: InvoiceInput & {
    recurrence: {
      intervalUnit: "WEEK" | "MONTH" | "YEAR";
      intervalCount: number;
      totalCycles: number;
    };
  },
): Record<string, unknown> {
  return {
    plan_detail: {
      frequency: {
        interval_unit: i.recurrence.intervalUnit,
        interval_count: i.recurrence.intervalCount,
      },
      total_cycles: i.recurrence.totalCycles,
      start_series_date: i.date,
    },
    recurring_info: invoiceBody(i),
  };
}
