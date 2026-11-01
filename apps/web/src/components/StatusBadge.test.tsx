import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

it("renders the status text and tone", () => {
  const html = renderToStaticMarkup(<StatusBadge tone="success">Paid</StatusBadge>);
  expect(html).toContain('class="badge"');
  expect(html).toContain('data-tone="success"');
  expect(html).toContain("Paid");
  expect(html).not.toContain("spinner");
  expect(html).not.toContain("aria-busy");
});

it("keeps the text beside a hidden spinner while busy", () => {
  const html = renderToStaticMarkup(
    <StatusBadge tone="neutral" busy>
      Sending…
    </StatusBadge>,
  );
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('<span class="spinner" aria-hidden="true"></span>');
  expect(html).toContain("Sending…");
});
