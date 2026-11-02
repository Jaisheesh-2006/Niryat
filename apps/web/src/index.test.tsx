import type { ProfileInput, PurposeCodeEntry } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Disclaimer, { metadata as disclaimerMetadata } from "./app/(public)/disclaimer/page";
import Login, { metadata as loginMetadata } from "./app/(public)/login/page";
import Home from "./app/(public)/page";
import Signup, { metadata as signupMetadata } from "./app/(public)/signup/page";
import { AuthForm } from "./components/AuthForm";
import { ProfileForm } from "./components/ProfileForm";
import { profileBody } from "./lib/forms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("renders the home page with sign-up and sign-in links without external services", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain(
    '<h1 class="display">Run your export business on PayPal. Niryat keeps it legal in India.</h1>',
  );
  expect(html).toContain('href="/signup"');
  expect(html).toContain('href="/login"');
  expect(html).toContain('href="/api/auth/paypal/start"');
});

it.each([
  { Page: Login, metadata: loginMetadata, title: "Sign in", switchHref: "/signup" },
  { Page: Signup, metadata: signupMetadata, title: "Create account", switchHref: "/login" },
])(
  "$title keeps keyboard order aligned with email, PayPal and the account switch",
  async ({ Page, metadata, title, switchHref }) => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(metadata.title).toBe(title);
    expect(html).toContain('class="card auth-card"');
    expect(html).toContain('class="auth-divider">or</div>');
    expect(html.indexOf('type="submit"')).toBeLessThan(
      html.indexOf('href="/api/auth/paypal/start"'),
    );
    expect(html.indexOf('href="/api/auth/paypal/start"')).toBeLessThan(
      html.indexOf(`href="${switchHref}"`),
    );
  },
);

it("renders the PLAN section 23 disclaimer without a session", () => {
  const html = renderToStaticMarkup(<Disclaimer />);
  const text = html.replace(/<[^>]*>/g, "").replaceAll("&#x27;", "'");
  expect(disclaimerMetadata.title).toBe("Disclaimer");
  expect(html).toContain("<h1>Disclaimer</h1>");
  expect(text).toContain(
    "Niryat prepares information and documents to help users and their chartered accountants.",
  );
  expect(text).toContain(
    "It does not provide tax or legal advice, does not file returns on anyone's behalf, and only takes PayPal actions (such as sending invoices or reminders) after the user approves them.",
  );
  expect(text).toContain(
    "Rules are sourced, versioned and checked against official primary texts, but have not been reviewed by a chartered accountant; this is a known limitation of the hackathon build.",
  );
  expect(text).toContain(
    "Each deployment also acts on one PayPal seller account; connecting each user's own PayPal account (Partner Referrals) is future work (findings).",
  );
  expect(text).toContain("Confirm anything you act on with a qualified CA.");
});

it.each(["P9999", "P0802", null])(
  "preserves saved purpose code %s when editing turnover",
  (purposeCode) => {
    const initial: ProfileInput = {
      legalName: "Ananya Rao",
      address: "12 MG Road, Pune 411001",
      gstRegistered: false,
      gstin: null,
      lutNumber: null,
      lutValidFrom: null,
      lutValidTo: null,
      expectedTurnoverInr: 100000,
      gstr1Frequency: null,
      specifiedProfession: null,
      workType: "Software development",
      purposeCode,
      panLast4: null,
    };
    const codes: PurposeCodeEntry[] = [
      { code: "P0802", paypalLabel: "Software", annexDescription: "Software", suggest: "yes" },
    ];
    const html = renderToStaticMarkup(<ProfileForm initial={initial} codes={codes} />);
    const selected = html.match(/<option value="([^"]*)" selected=""/)?.[1];
    expect(selected).toBe(purposeCode ?? "");
    expect(html.match(/<option value="P0802"/g)).toHaveLength(1);

    const form = new FormData();
    form.set("purposeCode", selected ?? "");
    form.set("expectedTurnoverInr", "200000");
    expect(profileBody(form)).toMatchObject({ purposeCode, expectedTurnoverInr: 200000 });
  },
);

it.each(["login", "signup"] as const)(
  "%s keeps credentials in a POST body when JavaScript is unavailable",
  (mode) => {
    const html = renderToStaticMarkup(<AuthForm mode={mode} />);
    expect(html.match(/<form\b[^>]*>/)?.[0]).toContain('method="post"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain(
      `autoComplete="${mode === "login" ? "current-password" : "new-password"}"`,
    );
  },
);

it.each([
  undefined,
  "",
  "http://localhost:3001",
  "http://localhost:3001/",
  "http://localhost:3001///",
])("rewrites API requests without doubled slashes for API_URL=%s", async (apiUrl) => {
  vi.stubEnv("API_URL", apiUrl);
  vi.resetModules();
  const { default: config } = await import("../next.config");
  expect(await config.rewrites?.()).toEqual([
    { source: "/api/:path*", destination: "http://localhost:3001/:path*" },
  ]);
});

it.each([
  { appUrl: undefined, hosts: [] },
  { appUrl: "", hosts: [] },
  { appUrl: "http://localhost:3000", hosts: ["localhost"] },
  { appUrl: "https://test-login.trycloudflare.com/", hosts: ["test-login.trycloudflare.com"] },
])(
  "allows only the configured development hostname for PUBLIC_APP_URL=$appUrl",
  async ({ appUrl, hosts }) => {
    vi.stubEnv("PUBLIC_APP_URL", appUrl);
    vi.resetModules();
    const { default: config } = await import("../next.config");
    expect(config.allowedDevOrigins).toEqual(hosts);
  },
);

it("rejects an invalid public URL without exposing the value", async () => {
  vi.stubEnv("PUBLIC_APP_URL", "invalid-private-value");
  vi.resetModules();
  await expect(import("../next.config")).rejects.toThrow(
    "Invalid environment: PUBLIC_APP_URL. See .env.example.",
  );
});

it("loads shared root settings in development so the tunnel can load client scripts", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("PUBLIC_APP_URL", undefined);
  const load = vi.spyOn(process, "loadEnvFile").mockImplementation(() => {
    process.env.PUBLIC_APP_URL = "https://configured-login.trycloudflare.com";
  });
  vi.resetModules();
  const { default: config } = await import("../next.config");
  expect(load).toHaveBeenCalledOnce();
  expect(config.allowedDevOrigins).toEqual(["configured-login.trycloudflare.com"]);
});

it.each(["test", "production"])("does not load a private environment file in %s", async (mode) => {
  vi.stubEnv("NODE_ENV", mode);
  const load = vi.spyOn(process, "loadEnvFile");
  vi.resetModules();
  await import("../next.config");
  expect(load).not.toHaveBeenCalled();
});

it.each(["ENOENT", "EACCES"])("handles development environment file errors: %s", async (code) => {
  vi.stubEnv("NODE_ENV", "development");
  vi.spyOn(process, "loadEnvFile").mockImplementation(() => {
    throw Object.assign(new Error("Environment file unavailable"), { code });
  });
  vi.resetModules();
  if (code === "ENOENT") {
    await expect(import("../next.config")).resolves.toHaveProperty("default");
  } else {
    await expect(import("../next.config")).rejects.toThrow("Environment file unavailable");
  }
});
