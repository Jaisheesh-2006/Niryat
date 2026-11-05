import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { expect, it } from "vitest";
import { config, proxy } from "./proxy";

function request(path: string, role?: string) {
  return new NextRequest(`https://niryat.example${path}`, {
    headers: role
      ? {
          cookie: `niryat_session=40000000-0000-4000-8000-000000000001.${role}.1793874600.signature%3D`,
        }
      : {},
  });
}

it.each([
  ["/invoices", "ca", "/ca"],
  ["/overview", "ca", "/ca"],
  ["/ca", "freelancer", "/overview"],
  ["/ca/clients/id", "freelancer", "/overview"],
])("routes %s with %s hint to %s", (path, role, destination) => {
  expect(proxy(request(path, role)).headers.get("location")).toBe(
    `https://niryat.example${destination}`,
  );
});

for (const role of ["ca", "freelancer", "unknown", undefined]) {
  it.each(["/ca/login", "/ca/signup", "/ca/login/"])(
    `keeps %s public with role=${role}`,
    (path) => {
      expect(proxy(request(path, role)).headers.get("location")).toBeNull();
    },
  );
}

it.each([
  ["/ca", "ca"],
  ["/invoices", "freelancer"],
  ["/invoices", "unknown"],
  ["/ca", undefined],
])("leaves %s with role=%s to verified layout checks", (path, role) => {
  expect(proxy(request(path, role)).headers.get("location")).toBeNull();
});

it.each([
  "/ca",
  "/ca/requests",
  "/overview",
  "/profile",
  "/health-check",
  "/clients",
  "/invoices/id",
  "/close",
  "/tasks",
  "/fira",
  "/dashboard",
  "/calendar",
  "/gstr1",
  "/advance-tax",
])("matches the protected route %s", (url) => {
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
});

it.each([
  "/",
  "/login",
  "/signup",
  "/disclaimer",
  "/api/auth/me",
  "/_next/static/app.js",
  "/invoices-other",
  "/ca-other",
])("does not intercept %s", (url) => {
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
});
