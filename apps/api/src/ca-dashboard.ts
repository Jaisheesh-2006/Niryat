import { getProfile, listCaClients, listInvoices, listReminderActions } from "@niryat/db";
import { evaluateHealth, financialYear } from "@niryat/rules";
import type { CaDashboard } from "@niryat/shared";
import { buildCalendarEvents } from "./calendar";
import { toInvoiceView } from "./compliance";
import { buildDashboard, buildPortfolioRow } from "./dashboard";
import type { AppDeps } from "./routes/auth";
import { rules } from "./rules";

export async function loadCaDashboard(
  deps: Pick<AppDeps, "db" | "encryptionKey">,
  caId: string,
  today: string,
): Promise<CaDashboard> {
  const clients = await Promise.all(
    (await listCaClients(deps.db, caId)).map(async (client) => {
      const id = client.freelancerId;
      const [profile, invoices, reminders] = await Promise.all([
        getProfile(deps.db, id, deps.encryptionKey),
        listInvoices(deps.db, id),
        // shortcut: counts proposed reminders among the latest 50 (as /close does); add a count query if clients exceed that.
        listReminderActions(deps.db, id, 50),
      ]);
      const views = invoices.map((invoice) =>
        toInvoiceView(invoice, profile?.gstRegistered ?? null, today),
      );
      const health = profile ? evaluateHealth(profile, { today, rules }) : null;
      return {
        row: buildPortfolioRow(client, {
          views,
          health,
          events: buildCalendarEvents({ profile: profile ?? null, views }, today, rules),
          reminders,
        }),
        dashboard: buildDashboard({ views, health: null }, today),
      };
    }),
  );
  clients.sort(
    (a, b) =>
      b.row.overdueCount - a.row.overdueCount ||
      (a.row.nextDeadline?.date ?? "~").localeCompare(b.row.nextDeadline?.date ?? "~"),
  );
  return {
    asOf: today,
    financialYear: financialYear(today),
    portfolio: clients.map(({ row }) => row),
    invoices: clients.flatMap(({ row, dashboard }) =>
      dashboard.invoices.map((invoice) => ({
        ...invoice,
        freelancerId: row.freelancerId,
        freelancerName: row.name ?? "Unnamed freelancer",
      })),
    ),
    payments: clients.flatMap(({ row, dashboard }) =>
      dashboard.payments.map((payment) => ({
        ...payment,
        freelancerId: row.freelancerId,
        freelancerName: row.name ?? "Unnamed freelancer",
      })),
    ),
  };
}
