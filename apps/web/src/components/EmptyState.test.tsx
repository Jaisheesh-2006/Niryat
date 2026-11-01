import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { FileText } from "./icons";

it("renders its icon, title, explanation and optional action", () => {
  const html = renderToStaticMarkup(
    <EmptyState icon={FileText} title="No invoices yet" action={<a href="#new">New invoice</a>}>
      Paste a client email and Claude fills in the invoice for you.
    </EmptyState>,
  );
  expect(html).toContain('class="card empty-state"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("<h3>No invoices yet</h3>");
  expect(html).toContain("Paste a client email and Claude fills in the invoice for you.");
  expect(html).toContain('href="#new"');
});
