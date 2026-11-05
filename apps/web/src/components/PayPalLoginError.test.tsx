import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import CaLogin from "../app/(public)/ca/login/page";
import CaSignup from "../app/(public)/ca/signup/page";
import Login from "../app/(public)/login/page";
import Signup from "../app/(public)/signup/page";
import { AuthForm } from "./AuthForm";
import { PayPalLoginError } from "./PayPalLoginError";

vi.mock("./AuthForm", () => ({ AuthForm: vi.fn(() => createElement("form")) }));

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
    expect(html).toContain("For freelancers");
    expect(html).toContain('href="/ca/login">Are you a CA? Sign in here</a>');
  },
);

it.each([CaLogin, CaSignup])("renders CA sign-in without PayPal", (Page) => {
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain("For chartered accountants");
  expect(html).toContain('href="/login">Are you a freelancer? Sign in here</a>');
  expect(html).toContain("<form>");
  expect(html).not.toContain("PayPal");
  expect(vi.mocked(AuthForm).mock.calls.at(-1)?.[0]).toEqual({
    mode: Page === CaLogin ? "login" : "signup",
    audience: "ca",
  });
});

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
