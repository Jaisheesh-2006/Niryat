import { sessionUserSchema } from "@niryat/shared";
import { redirect } from "next/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NavLinks } from "../../components/NavLinks";
import { SignOutButton } from "../../components/SignOutButton";
import { apiGet } from "../../lib/api";
import CaLayout from "./layout";

vi.mock("../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("../../components/NavLinks", () => ({ NavLinks: vi.fn(() => null) }));
vi.mock("../../components/SignOutButton", () => ({ SignOutButton: vi.fn(() => null) }));

afterEach(() => vi.clearAllMocks());

it("renders the CA shell around its page from a verified session", async () => {
  vi.mocked(apiGet).mockResolvedValue({
    id: "40000000-0000-4000-8000-000000000001",
    email: "ca@example.com",
    role: "ca",
  });
  const html = renderToStaticMarkup(await CaLayout({ children: <p>CA page</p> }));
  expect(apiGet).toHaveBeenCalledExactlyOnceWith("/auth/me", sessionUserSchema, "/ca/login");
  expect(html).toContain('title="ca@example.com">ca@example.com</p>');
  expect(html).toContain('<p class="systembar">PayPal sandbox only · Not tax or legal advice · ');
  expect(html).toContain('href="#main">Skip to content</a>');
  expect(html).toContain('id="main"');
  expect(html).toContain("<p>CA page</p>");
  expect(vi.mocked(NavLinks).mock.calls[0]?.[0]).toEqual({ audience: "ca" });
  expect(vi.mocked(SignOutButton).mock.calls[0]?.[0]).toEqual({ loginPath: "/ca/login" });
  expect(redirect).not.toHaveBeenCalled();
});

it.each([
  null,
  { id: "40000000-0000-4000-8000-000000000001", email: "seller@example.com", role: "freelancer" },
])("requires a verified CA session: %s", async (me) => {
  vi.mocked(apiGet).mockResolvedValue(me);
  await expect(CaLayout({ children: <p>Protected</p> })).rejects.toThrow("redirect:/ca/login");
  expect(redirect).toHaveBeenCalledExactlyOnceWith("/ca/login");
  expect(NavLinks).not.toHaveBeenCalled();
});

it("propagates session service failures", async () => {
  const error = new Error("Session service unavailable");
  vi.mocked(apiGet).mockRejectedValue(error);
  await expect(CaLayout({ children: <p>Protected</p> })).rejects.toBe(error);
});
