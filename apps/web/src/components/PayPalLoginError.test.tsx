import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import Login from "../app/login/page";
import Signup from "../app/signup/page";
import { PayPalLoginError } from "./PayPalLoginError";

vi.mock("./AuthForm", () => ({ AuthForm: () => createElement("form") }));

it.each([Login, Signup])(
  "renders email and PayPal sign-in with awaited search parameters",
  async (Page) => {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: "paypal_failed" }) }),
    );
    expect(html).toContain("<form>");
    expect(html).toContain('href="/api/auth/paypal/start"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("use email sign-in.");
  },
);

it.each(["paypal_cancelled", "paypal_failed", "paypal_unavailable", "email_taken", "no_email"])(
  "shows a fixed accessible message for %s",
  (error) => {
    expect(renderToStaticMarkup(createElement(PayPalLoginError, { error }))).toContain(
      'role="alert"',
    );
  },
);

it.each([undefined, "<script>injected</script>", "toString", ["paypal_failed", "secret"]])(
  "does not display unknown or repeated error parameters: %s",
  (error) => {
    expect(renderToStaticMarkup(createElement(PayPalLoginError, { error }))).toBe("");
  },
);
