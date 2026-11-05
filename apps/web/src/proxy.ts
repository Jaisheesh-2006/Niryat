import { userRoles } from "@niryat/shared";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (/^\/ca\/(login|signup)\/?$/.test(path)) return NextResponse.next();
  // Navigation hint only; the API verifies signatures and roles before serving data.
  const role = z
    .enum(userRoles)
    .safeParse(request.cookies.get("niryat_session")?.value.split(".")[1]);
  const caPath = path === "/ca" || path.startsWith("/ca/");
  if (role.success && role.data === "ca" && !caPath) {
    return NextResponse.redirect(new URL("/ca", request.url));
  }
  if (role.success && role.data === "freelancer" && caPath) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/ca/:path*",
    "/overview/:path*",
    "/profile/:path*",
    "/health-check/:path*",
    "/clients/:path*",
    "/invoices/:path*",
    "/close/:path*",
    "/tasks/:path*",
    "/fira/:path*",
    "/dashboard/:path*",
    "/calendar/:path*",
    "/gstr1/:path*",
    "/advance-tax/:path*",
  ],
};
