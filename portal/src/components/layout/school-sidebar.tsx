"use client";

import {
  GraduationCap,
  LayoutDashboard,
  Receipt,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { GlobalSearch } from "@/components/layout/global-search";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarFrame, SidebarNavItem } from "@/components/layout/sidebar-frame";
import type { StaffPermission } from "@/lib/types";

const setupPathPrefixes = [
  "/school/setup",
  "/school/teachers",
  "/school/staff",
  "/school/academics",
  "/school/exams",
  "/school/settings",
  "/school/id-cards",
  "/school/announcements",
  "/school/events",
  "/school/parents",
  "/school/lessons",
  "/school/quizzes",
  "/school/results",
  "/school/attendance",
  "/school/report-cards",
];

const mainNav: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: StaffPermission;
  matchSetup?: boolean;
}> = [
  { href: "/school/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "VIEW_DASHBOARD" },
  { href: "/school/front-desk", label: "Find a child", icon: Search, permission: "SEARCH_STUDENTS" },
  { href: "/school/students", label: "Students", icon: GraduationCap },
  { href: "/school/fees", label: "Fees", icon: Wallet, permission: "VIEW_FINANCE" },
  { href: "/school/expenses", label: "Salaries & bills", icon: Receipt, permission: "MANAGE_EXPENSES" },
  { href: "/school/setup", label: "Setup", icon: Settings2, matchSetup: true },
];

function isActivePath(pathname: string, href: string, matchSetup?: boolean) {
  if (matchSetup) {
    return setupPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  if (href === "/school/fees" && pathname.startsWith("/school/fees")) return true;
  return true;
}

export function SchoolSidebar() {
  const pathname = usePathname();
  const { user, logout, can } = useAuth();
  const subtitle = user?.roles.includes("PRINCIPAL") ? "Principal" : "Administration";
  const items = mainNav.filter((item) => !item.permission || can(item.permission));

  return (
    <SidebarFrame
      subtitle={subtitle}
      userName={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
      onLogout={logout}
    >
      {items.map(({ href, label, icon, matchSetup }) => (
        <SidebarNavItem
          key={href}
          href={href}
          label={label}
          icon={icon}
          active={isActivePath(pathname, href, matchSetup)}
        />
      ))}
    </SidebarFrame>
  );
}

export function SchoolShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell inverted sidebar={<SchoolSidebar />} header={<GlobalSearch />}>
      {children}
    </AppShell>
  );
}
