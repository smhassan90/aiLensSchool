"use client";

import {
  CalendarClock,
  CalendarDays,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings2,
  Trophy,
  UserSquare2,
  Wallet,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { GlobalSearch } from "@/components/layout/global-search";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarFrame, SidebarNavItem } from "@/components/layout/sidebar-frame";
import {
  SchoolBackgroundPrefetch,
  prefetchMenuHref,
} from "@/components/layout/background-prefetch";
import type { StaffPermission } from "@/lib/types";
import { personFullName } from "@/lib/person-name";

const setupPathPrefixes = [
  "/school/setup",
  "/school/staff",
  "/school/academics",
  "/school/timetable",
  "/school/exams",
  "/school/settings",
  "/school/id-cards",
  "/school/announcements",
  "/school/events",
  "/school/parents",
  "/school/lessons",
  "/school/quizzes",
  "/school/exam-papers",
  "/school/submitted-exam-papers",
  "/school/exam-deadline-extensions",
  "/school/results",
  "/school/attendance",
  "/school/day-off-requests",
  "/school/student-photos",
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
  { href: "/school/students", label: "Students", icon: GraduationCap },
  { href: "/school/teachers", label: "Teachers", icon: UserSquare2 },
  { href: "/school/exams", label: "Exams", icon: Trophy, permission: "MANAGE_EXAMS" },
  { href: "/school/submitted-exam-papers", label: "Exam papers", icon: FileText },
  { href: "/school/announcements", label: "Notifications", icon: Megaphone },
  { href: "/school/day-off-requests", label: "Day-off requests", icon: CalendarDays },
  { href: "/school/student-photos", label: "Student photos", icon: UserSquare2 },
  { href: "/school/exam-deadline-extensions", label: "Deadline extensions", icon: CalendarClock, permission: "MANAGE_EXAMS" },
  { href: "/school/fees", label: "Collect fees", icon: Wallet, permission: "VIEW_FINANCE" },
  { href: "/school/expenses", label: "Salaries & bills", icon: Receipt, permission: "MANAGE_EXPENSES" },
  { href: "/school/setup", label: "Setup", icon: Settings2, matchSetup: true },
];

function isActivePath(pathname: string, href: string, matchSetup?: boolean) {
  if (matchSetup) {
    return setupPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  if (pathname === href) return true;
  if (href === "/school/dashboard" && pathname.startsWith("/school/classes")) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  if (href === "/school/fees" && pathname.startsWith("/school/fees")) return true;
  return true;
}

export function SchoolSidebar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, logout, can } = useAuth();
  const subtitle = user?.roles.includes("PRINCIPAL") ? "Principal" : "Administration";
  const items = mainNav.filter((item) => {
    if (item.href === "/school/teachers") {
      return can("MANAGE_TEACHERS") || can("VIEW_TEACHER_PROGRESS");
    }
    return !item.permission || can(item.permission);
  });

  return (
    <SidebarFrame
      subtitle={subtitle}
      userName={personFullName(user?.firstName, user?.lastName)}
      onLogout={logout}
    >
      {items.map(({ href, label, icon, matchSetup }) => (
        <SidebarNavItem
          key={href}
          href={href}
          label={label}
          icon={icon}
          active={isActivePath(pathname, href, matchSetup)}
          onPrefetch={(path) => prefetchMenuHref(queryClient, path)}
        />
      ))}
    </SidebarFrame>
  );
}

export function SchoolShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell inverted sidebar={<SchoolSidebar />} header={<GlobalSearch />}>
      <SchoolBackgroundPrefetch />
      {children}
    </AppShell>
  );
}
