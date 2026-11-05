"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PublicAuthLinks() {
  const prefix = usePathname().startsWith("/ca/") ? "/ca" : "";
  return (
    <div>
      <Link href={`${prefix}/login`} className="btn" data-variant="ghost">
        Sign in
      </Link>{" "}
      <Link href={`${prefix}/signup`} className="btn" data-variant="primary">
        Create account
      </Link>
    </div>
  );
}
