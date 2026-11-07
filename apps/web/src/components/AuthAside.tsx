import type { UserRole } from "@niryat/shared";

const copy: Record<UserRole, { title: string; points: readonly string[] }> = {
  freelancer: {
    title: "Every PayPal action waits for you.",
    points: [
      "Invoices, reminders and refunds reach PayPal only after you approve them.",
      "Deadlines and tax figures cite the rule they come from.",
      "PayPal sandbox only. Nothing is filed for you.",
    ],
  },
  ca: {
    title: "Your clients' export records, ready for review.",
    points: [
      "See every freelancer who shares records with you in one portfolio.",
      "Track deadlines across clients in one calendar, each with its rule.",
      "Read-only records. Clients approve their own payment actions.",
    ],
  },
};

export function AuthAside({ audience = "freelancer" }: { audience?: UserRole }) {
  const { title, points } = copy[audience];
  return (
    <aside className="auth-aside" aria-label="About Niryat">
      <p className="auth-aside-hindi" lang="hi" aria-hidden="true">
        निर्यात
      </p>
      <h2>{title}</h2>
      <ul>
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </aside>
  );
}
