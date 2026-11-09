import type { CaLink } from "@niryat/shared";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CaInvitationForm } from "./CaInvitationForm";
import { CaRequestButtons } from "./CaRequestButtons";
import { CaShareCard } from "./CaShareCard";

const state = vi.hoisted(() => ({
  pending: false,
  message: "",
  invitation: null as { linkId: string; code: string } | null,
  actions: [] as Promise<unknown>[],
}));
const { refresh, setMessage, setInvitation } = vi.hoisted(() => ({
  refresh: vi.fn(),
  setMessage: vi.fn(),
  setInvitation: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) =>
    initial === null ? [state.invitation, setInvitation] : [state.message, setMessage],
  useTransition: () => [
    state.pending,
    (fn: () => unknown) => {
      const result = fn();
      if (result instanceof Promise) state.actions.push(result);
    },
  ],
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  state.pending = false;
  state.message = "";
  state.invitation = null;
  state.actions = [];
});

const link: CaLink = {
  id: "10000000-0000-4000-8000-000000000001",
  caEmail: "ca@example.com",
  status: "pending",
  createdAt: "2026-11-04T12:00:00.000Z",
  respondedAt: null,
};
const invitationCode = `${link.id}.${"1".repeat(64)}`;
type FormEvent = { preventDefault: () => void; currentTarget: object };
type Props = {
  children?: ReactNode;
  onClick?: () => void;
  onSubmit?: (event: FormEvent) => void;
  disabled?: boolean;
};
function elements(node: ReactNode, type: string): ReactElement<Props>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Props>(child)) return [];
    return [...(child.type === type ? [child] : []), ...elements(child.props.children, type)];
  });
}

it.each([
  { status: null, expected: "Send request" },
  { status: "pending", expected: "Cancel request" },
  { status: "accepted", expected: "Stop sharing" },
  { status: "ended", expected: "Send request" },
] as const)("renders the $status card with the required copy", ({ status, expected }) => {
  const html = renderToStaticMarkup(
    <CaShareCard
      link={status ? { ...link, status, respondedAt: "2026-11-04T19:00:00.000Z" } : null}
    />,
  );
  expect(html).toContain("Your CA</p>");
  expect(html).toContain("Share your records with your CA");
  expect(html).toContain(
    "Your CA will see your invoices, payments, deadlines and reports. They cannot send anything from your PayPal or approve actions. You can stop sharing at any time.",
  );
  expect(html).toContain(expected);
  if (status === "pending")
    expect(html).toContain(
      "Waiting for ca@example.com to accept. Ask them to sign in to Niryat as a CA with this email.",
    );
  if (status === "accepted")
    expect(html).toContain(
      'Shared with ca@example.com since <time dateTime="2026-11-04T19:00:00.000Z">5 Nov 2026</time>.',
    );
  if (!status || status === "ended") {
    expect(html).toContain('for="caEmail">Your CA&#x27;s email</label>');
    expect(html).toContain('type="email"');
    expect(html).toContain('required=""');
  } else expect(html).not.toContain('name="caEmail"');
});

it.each([
  { status: null, path: "/api/ca-link", body: { caEmail: "CA@example.com" }, response: 201 },
  { status: "pending", path: "/api/ca-link/end", body: { linkId: link.id }, response: 204 },
  { status: "accepted", path: "/api/ca-link/end", body: { linkId: link.id }, response: 204 },
  { status: "ended", path: "/api/ca-link", body: { caEmail: "CA@example.com" }, response: 201 },
] as const)("submits and refreshes the $status card", async ({ status, path, body, response }) => {
  vi.stubGlobal(
    "FormData",
    class extends FormData {
      constructor() {
        super();
        this.set("caEmail", " CA@example.com ");
      }
    },
  );
  const fetch = vi
    .fn()
    .mockResolvedValue(
      response === 201
        ? Response.json({ link, invitationCode }, { status: 201 })
        : new Response(null, { status: response }),
    );
  vi.stubGlobal("fetch", fetch);
  const form = elements(CaShareCard({ link: status ? { ...link, status } : null }), "form")[0];
  const preventDefault = vi.fn();
  if (!form?.props.onSubmit) throw new Error("Expected share form");
  form.props.onSubmit({ preventDefault, currentTarget: {} });
  await Promise.all(state.actions);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(setInvitation).toHaveBeenCalledExactlyOnceWith(
    response === 201 ? { linkId: link.id, code: invitationCode } : null,
  );
});

it.each([
  ["own_email", "Enter your CA's email, not your own."],
  ["link_exists", "You already have a CA request. Cancel it first."],
  ["not_found", "Not found. Refresh the page."],
] as const)("shows %s without a success refresh", async (error, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error }, { status: 400 })));
  const form = elements(CaShareCard({ link }), "form")[0];
  if (!form?.props.onSubmit) throw new Error("Expected share form");
  form.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });
  await Promise.all(state.actions);
  expect(refresh).not.toHaveBeenCalled();
  expect(setMessage).toHaveBeenLastCalledWith(message);
  state.message = message;
  const html = renderToStaticMarkup(<CaShareCard link={link} />);
  expect(html).toContain('aria-describedby="ca-share-error"');
  expect(html).toContain('id="ca-share-error" role="alert"');
});

it.each(["accept", "decline"])("sends a CA %s and refreshes", async (action) => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const buttons = elements(CaRequestButtons({ requestId: link.id }), "button");
  const button = buttons[action === "accept" ? 0 : 1];
  if (!button?.props.onClick) throw new Error("Expected request button");
  button.props.onClick();
  await Promise.all(state.actions);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/ca/requests/${link.id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps a stale CA request failure visible", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: "not_found" }, { status: 404 })),
  );
  const button = elements(CaRequestButtons({ requestId: link.id }), "button")[0];
  if (!button?.props.onClick) throw new Error("Expected accept button");
  button.props.onClick();
  await Promise.all(state.actions);
  expect(setMessage).toHaveBeenLastCalledWith("Not found. Refresh the page.");
  expect(refresh).not.toHaveBeenCalled();
  state.message = "Not found. Refresh the page.";
  expect(renderToStaticMarkup(<CaRequestButtons requestId={link.id} />)).toContain(
    'role="alert">Not found. Refresh the page.</p>',
  );
});

it("shows the one-time code only for the pending link it was created for", () => {
  state.invitation = { linkId: link.id, code: invitationCode };
  const html = renderToStaticMarkup(<CaShareCard link={link} />);
  expect(html).toContain('for="ca-invitation-code">Invitation code (shown once)</label>');
  expect(html).toContain(invitationCode);
  expect(html).toContain("Share it privately with the CA you intend to invite.");
  expect(
    renderToStaticMarkup(
      <CaShareCard link={{ ...link, id: "10000000-0000-4000-8000-000000000002" }} />,
    ),
  ).not.toContain(invitationCode);
  expect(
    renderToStaticMarkup(<CaShareCard link={{ ...link, status: "accepted" }} />),
  ).not.toContain(invitationCode);
  state.invitation = null;
  const reloaded = renderToStaticMarkup(<CaShareCard link={link} />);
  expect(reloaded).not.toContain(invitationCode);
  expect(reloaded).toContain("If you did not save it, cancel this request and send a new one.");
});

it.each(["success", "invalid", "network"])(
  "submits a private invitation code and handles %s",
  async (outcome) => {
    vi.stubGlobal(
      "FormData",
      class extends FormData {
        constructor() {
          super();
          this.set("invitationCode", ` ${invitationCode} `);
        }
      },
    );
    const fetch = vi.fn();
    if (outcome === "network") fetch.mockRejectedValue(new Error("Network unavailable"));
    else
      fetch.mockResolvedValue(
        outcome === "success"
          ? new Response(null, { status: 204 })
          : Response.json({ error: "invalid_invitation" }, { status: 404 }),
      );
    vi.stubGlobal("fetch", fetch);
    const form = elements(CaInvitationForm(), "form")[0];
    if (!form?.props.onSubmit) throw new Error("Expected invitation form");
    form.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });
    await Promise.all(state.actions);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/ca/requests/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationCode }),
    });
    expect(refresh).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
    expect(setMessage).toHaveBeenLastCalledWith(
      outcome === "success"
        ? ""
        : outcome === "invalid"
          ? "This invitation code is invalid or no longer pending. Ask your client for a new one."
          : "We couldn't complete this request. Try again.",
    );
  },
);

it("labels invitation entry and exposes claim errors without putting the code in a URL", () => {
  state.message =
    "This invitation code is invalid or no longer pending. Ask your client for a new one.";
  const html = renderToStaticMarkup(<CaInvitationForm />);
  expect(html).toContain('for="invitationCode">Invitation code</label>');
  expect(html).toContain('autoComplete="off"');
  expect(html).toContain('aria-describedby="ca-invitation-error"');
  expect(html).toContain('id="ca-invitation-error" role="alert"');
});

it("disables all share and request actions while saving", () => {
  state.pending = true;
  for (const element of [
    CaInvitationForm(),
    CaShareCard({ link: null }),
    CaShareCard({ link }),
    CaRequestButtons({ requestId: link.id }),
  ]) {
    const buttons = elements(element, "button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.props.disabled).toBe(true);
  }
});
