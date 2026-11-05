import { afterEach, expect, it, vi } from "vitest";
import { sendJson } from "../lib/forms";
import { SignOutButton } from "./SignOutButton";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../lib/forms", () => ({ sendJson: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: () => ["", vi.fn()],
}));
afterEach(() => vi.clearAllMocks());

it.each([undefined, "/ca/login"])("returns sign-out to loginPath=%s", async (loginPath) => {
  vi.mocked(sendJson).mockResolvedValue({ ok: true, data: undefined });
  const form = SignOutButton(loginPath ? { loginPath } : {});
  await form.props.children[0].props.onClick();
  expect(sendJson).toHaveBeenCalledExactlyOnceWith("/api/auth/logout", "POST", {});
  expect(push).toHaveBeenCalledExactlyOnceWith(loginPath ?? "/login");
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps the current page when sign-out fails", async () => {
  vi.mocked(sendJson).mockResolvedValue({ ok: false, message: "Try again." });
  await SignOutButton({ loginPath: "/ca/login" }).props.children[0].props.onClick();
  expect(push).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
