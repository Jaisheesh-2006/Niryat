import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CardFallback } from "./CardBoundary";

it("renders fixed fallback text without exposing the error", () => {
  const retry = vi.fn();
  const fallback = CardFallback(
    { title: "Recent invoices" },
    { error: new Error("private server details"), retry, reset: vi.fn() },
  );
  const html = renderToStaticMarkup(fallback);
  expect(html).toContain("<h2>Recent invoices</h2>");
  expect(html).toContain("Couldn&#x27;t load this card. Nothing was sent to PayPal.");
  expect(html).toContain('data-variant="ghost"');
  expect(html).toContain("Try again");
  expect(html).not.toContain("private server details");
  const button = fallback?.props.children[2];
  button.props.onClick();
  expect(retry).toHaveBeenCalledOnce();
});

it("renders nothing for a quiet boundary", () => {
  expect(
    CardFallback(
      { title: "Approvals", quiet: true },
      { error: new Error("private server details"), retry: vi.fn(), reset: vi.fn() },
    ),
  ).toBeNull();
});
