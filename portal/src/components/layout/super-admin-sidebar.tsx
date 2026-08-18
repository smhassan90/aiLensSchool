"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Activity,
  Building2,
  CreditCard,
  FileText,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Receipt,
  School,
  Settings,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { BrandMark } from "@/components/brand/brand-mark";
import { AppShell } from "@/components/layout/app-shell";

const navItems = [
  { href: "/super-admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super-admin/schools", label: "Schools", icon: School },
  { href: "/super-admin/branches", label: "Branches", icon: GitBranch },
  { href: "/super-admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/super-admin/billing", label: "Billing", icon: Receipt },
  { href: "/super-admin/pricing", label: "Pricing", icon: Tag },
  { href: "/super-admin/users", label: "Users", icon: Users },
  { href: "/super-admin/ai-usage", label: "AI Usage", icon: Sparkles },
  { href: "/super-admin/audit-logs", label: "Audit Logs", icon: FileText },
  { href: "/super-admin/system", label: "System", icon: Settings },
];

export function SuperAdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-6 py-5">
        <BrandMark inverted subtitle="Super Admin" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent/20 text-white"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-border/60 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3 truncate text-xs text-sidebar-foreground/70">
          {user?.firstName} {user?.lastName}
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-border/60"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      inverted
      className="theme-super-admin"
      sidebar={<SuperAdminSidebar />}
      header={<p className="truncate text-sm font-medium text-muted-foreground">Super Admin</p>}
    >
      {children}
    </AppShell>
  );
}
