import type { ProfileInput, PurposeCodeEntry } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Home from "./app/page";
import { AuthForm } from "./components/AuthForm";
import { ProfileForm } from "./components/ProfileForm";
import { profileBody } from "./lib/forms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => vi.unstubAllEnvs());

it("renders the home page with sign-up and sign-in links without external services", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("<h1>Niryat</h1>");
  expect(html).toContain('href="/signup"');
  expect(html).toContain('href="/login"');
});

it.each(["P9999", "P0802", null])(
  "preserves saved purpose code %s when editing turnover",
  (purposeCode) => {
    const initial: ProfileInput = {
      gstRegistered: false,
      gstin: null,
      lutNumber: null,
      lutValidFrom: null,
      lutValidTo: null,
      expectedTurnoverInr: 100000,
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
