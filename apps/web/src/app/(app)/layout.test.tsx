import { sessionUserSchema } from "@niryat/shared";
import { redirect } from "next/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { apiGet } from "../../lib/api";
import AppLayout from "./layout";

vi.mock("../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("../../components/NavLinks", () => ({ NavLinks: () => null }));
vi.mock("../../components/SignOutButton", () => ({ SignOutButton: () => null }));

afterEach(() => vi.clearAllMocks());

it("checks the session once and renders the account email and protected content", async () => {
  const user = {
    id: "40000000-0000-4000-8000-000000000001",
    email: "seller@example.com",
    role: "freelancer",
  };
  vi.mocked(apiGet).mockResolvedValue(user);
  const html = renderToStaticMarkup(await AppLayout({ children: <p>Protected content</p> }));
  expect(apiGet).toHaveBeenCalledExactlyOnceWith("/auth/me", sessionUserSchema);
  expect(redirect).not.toHaveBeenCalled();
  expect(html).toContain('title="seller@example.com">seller@example.com</p>');
  expect(html).toContain("<p>Protected content</p>");
  expect(html).not.toContain(user.id);
});

it("redirects a missing session to login instead of returning the shell", async () => {
  vi.mocked(apiGet).mockResolvedValue(null);
  await expect(AppLayout({ children: <p>Protected content</p> })).rejects.toThrow(
    "redirect:/login",
  );
  expect(redirect).toHaveBeenCalledExactlyOnceWith("/login");
});

it("redirects a verified CA to its own area", async () => {
  vi.mocked(apiGet).mockResolvedValue({
    id: "40000000-0000-4000-8000-000000000001",
    email: "ca@example.com",
    role: "ca",
  });
  await expect(AppLayout({ children: <p>Protected content</p> })).rejects.toThrow("redirect:/ca");
  expect(redirect).toHaveBeenCalledExactlyOnceWith("/ca");
});

it("propagates server failures to the page error boundary", async () => {
  const error = new Error("Session endpoint unavailable");
  vi.mocked(apiGet).mockRejectedValue(error);
  await expect(AppLayout({ children: <p>Protected content</p> })).rejects.toBe(error);
  expect(redirect).not.toHaveBeenCalled();
});
