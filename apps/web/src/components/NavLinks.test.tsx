import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NavLinks } from "./NavLinks";

const { route, effects } = vi.hoisted(() => ({
  route: { pathname: "/overview" },
  effects: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: effects,
}));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ["/invoices", "Invoices"],
  ["/invoices/x", "Invoices"],
  ["/overview", "Today"],
])("marks only the active item at %s", (pathname, label) => {
  route.pathname = pathname;
  const html = renderToStaticMarkup(<NavLinks badge={null} />);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toMatch(new RegExp(`<a[^>]*aria-current="page"[^>]*>.*?</svg>${label}</a>`));
});

it("does not match a partial segment", () => {
  route.pathname = "/invoices-other";
  expect(renderToStaticMarkup(<NavLinks badge={null} />)).not.toContain("aria-current");
});

it.each([
  ["/ca", "Clients"],
  ["/ca/calendar", "Calendar"],
  ["/ca/requests", "Requests"],
])("shows only CA links and one active item at %s", (pathname, label) => {
  route.pathname = pathname;
  const html = renderToStaticMarkup(<NavLinks audience="ca" />);
  expect([...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((match) => match[1])).toEqual([
    "/ca",
    "/ca/calendar",
    "/ca/requests",
  ]);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toMatch(new RegExp(`<a[^>]*aria-current="page"[^>]*>.*?</svg>${label}</a>`));
});

it("keeps the groups and links in demo order with the badge beside Monthly close", () => {
  const html = renderToStaticMarkup(<NavLinks badge={<span>Badge slot</span>} />);
  expect([...html.matchAll(/class="nav-group">(.*?)<\/p>/g)].map((match) => match[1])).toEqual([
    "Set up",
    "Bill and get paid",
    "Close the month",
    "Reports",
  ]);
  expect([...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((match) => match[1])).toEqual([
    "/overview",
    "/profile",
    "/health-check",
    "/clients",
    "/invoices",
    "/close",
    "/tasks",
    "/fira",
    "/dashboard",
    "/calendar",
    "/gstr1",
    "/advance-tax",
  ]);
  expect(html).toContain('aria-label="Main"');
  expect(html).toContain("Monthly close<span>Badge slot</span></a>");
  expect(html.match(/Badge slot/g)).toHaveLength(1);
});

it("closes the native menu when selecting the current route without running an effect", () => {
  const hidePopover = vi.fn();
  vi.stubGlobal("document", { getElementById: vi.fn(() => ({ hidePopover })) });
  route.pathname = "/invoices";
  const groups = Children.toArray(NavLinks({ badge: null }).props.children);
  const currentLink = groups
    .flatMap((group) =>
      isValidElement<{ children: ReactNode }>(group) ? Children.toArray(group.props.children) : [],
    )
    .find((child) => isValidElement<{ href: string }>(child) && child.props.href === "/invoices");
  if (!isValidElement<{ onNavigate?: () => void }>(currentLink))
    throw new Error("Expected the Invoices link");
  expect(hidePopover).not.toHaveBeenCalled();
  expect(currentLink.props.onNavigate).toBeTypeOf("function");
  currentLink.props.onNavigate?.();
  expect(hidePopover).toHaveBeenCalledOnce();
});

it("closes the native menu when the pathname changes", () => {
  const hidePopover = vi.fn();
  const getElementById = vi.fn(() => ({ hidePopover }));
  vi.stubGlobal("document", { getElementById });
  effects.mockImplementation((effect: () => void) => effect());
  route.pathname = "/tasks";
  renderToStaticMarkup(<NavLinks badge={null} />);
  expect(effects).toHaveBeenCalledWith(expect.any(Function), ["/tasks"]);
  expect(getElementById).toHaveBeenCalledWith("nav-menu");
  expect(hidePopover).toHaveBeenCalledOnce();
});
