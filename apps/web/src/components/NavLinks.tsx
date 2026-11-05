"use client";

import type { UserRole } from "@niryat/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import {
  Calculator,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  FileCheck,
  FileSpreadsheet,
  FileText,
  House,
  ListChecks,
  ShieldCheck,
  UserRound,
  Users,
} from "./icons";

const groups = [
  { label: "", items: [{ href: "/overview", label: "Today", icon: House }] },
  {
    label: "Set up",
    items: [
      { href: "/profile", label: "Profile", icon: UserRound },
      { href: "/health-check", label: "Health check", icon: ShieldCheck },
      { href: "/clients", label: "Clients", icon: Users },
    ],
  },
  {
    label: "Bill and get paid",
    items: [{ href: "/invoices", label: "Invoices", icon: FileText }],
  },
  {
    label: "Close the month",
    items: [
      { href: "/close", label: "Monthly close", icon: CalendarCheck },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
      { href: "/fira", label: "Payment proof", icon: FileCheck },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: ChartColumn },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/gstr1", label: "GST sales return", icon: FileSpreadsheet },
      { href: "/advance-tax", label: "Advance tax", icon: Calculator },
    ],
  },
];

const caGroups = [
  {
    label: "",
    items: [
      { href: "/ca", label: "Clients", icon: Users },
      { href: "/ca/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/ca/requests", label: "Requests", icon: ListChecks },
    ],
  },
];

export function NavLinks({
  badge,
  audience = "freelancer",
}: {
  badge?: ReactNode;
  audience?: UserRole;
}) {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) document.getElementById("nav-menu")?.hidePopover?.();
  }, [pathname]);

  return (
    <nav aria-label="Main">
      {(audience === "ca" ? caGroups : groups).map((group) => (
        <div key={group.label}>
          {group.label && <p className="nav-group">{group.label}</p>}
          {group.items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="nav-item"
              onNavigate={() => document.getElementById("nav-menu")?.hidePopover?.()}
              aria-current={
                pathname === href || (href !== "/ca" && pathname.startsWith(`${href}/`))
                  ? "page"
                  : undefined
              }
            >
              <Icon size={18} />
              {label}
              {href === "/close" && badge}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
