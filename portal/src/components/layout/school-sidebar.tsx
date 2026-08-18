"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Receipt,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { GlobalSearch } from "@/components/layout/global-search";
import { BrandMark } from "@/components/brand/brand-mark";
import { AppShell } from "@/components/layout/app-shell";
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

  const items = mainNav.filter((item) => !item.permission || can(item.permission));

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r bg-card print:hidden">
      <div className="border-b px-6 py-5">
        <BrandMark subtitle={user?.roles.includes("PRINCIPAL") ? "Principal" : "Administration"} />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        {items.map(({ href, label, icon: Icon, matchSetup }) => {
          const active = isActivePath(pathname, href, matchSetup);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="mb-3 truncate text-xs text-muted-foreground">
          {user?.firstName} {user?.lastName}
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function SchoolShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sidebar={<SchoolSidebar />} header={<GlobalSearch />}>
      {children}
    </AppShell>
  );
}
