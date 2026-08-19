"use client";

import {
  CreditCard,
  FileText,
  GitBranch,
  LayoutDashboard,
  Receipt,
  School,
  Settings,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarFrame, SidebarNavItem } from "@/components/layout/sidebar-frame";

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
    <SidebarFrame
      subtitle="Super Admin"
      userName={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
      onLogout={logout}
    >
      {navItems.map(({ href, label, icon }) => (
        <SidebarNavItem
          key={href}
          href={href}
          label={label}
          icon={icon}
          active={pathname === href || pathname.startsWith(`${href}/`)}
        />
      ))}
    </SidebarFrame>
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
