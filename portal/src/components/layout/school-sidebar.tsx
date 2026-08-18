"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Calendar,
  ClipboardList,
  CreditCard,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  LogOut,
  Megaphone,
  NotebookPen,
  Search,
  Settings,
  Users,
  UserSquare2,
  ClipboardCheck,
  FileQuestion,
  Trophy,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { GlobalSearch } from "@/components/layout/global-search";
import { BrandMark } from "@/components/brand/brand-mark";
import { AppShell } from "@/components/layout/app-shell";
import type { StaffPermission } from "@/lib/types";

const navGroups: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: typeof LayoutDashboard; permission?: StaffPermission }>;
}> = [
  {
    label: "Today",
    items: [
      { href: "/school/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "VIEW_DASHBOARD" },
      { href: "/school/front-desk", label: "Find a child", icon: Search, permission: "SEARCH_STUDENTS" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/school/students", label: "Students", icon: GraduationCap },
      { href: "/school/parents", label: "Parents", icon: Users },
      { href: "/school/teachers", label: "Teachers", icon: UserSquare2 },
      { href: "/school/teachers/new", label: "Add teacher", icon: UserSquare2, permission: "MANAGE_TEACHERS" },
      { href: "/school/staff", label: "Staff access", icon: Users, permission: "MANAGE_STAFF" },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/school/academics/years", label: "Academic Years", icon: Calendar, permission: "MANAGE_CLASSES" },
      { href: "/school/academics/grades", label: "Classes", icon: BookOpen, permission: "MANAGE_CLASSES" },
      { href: "/school/academics/sections", label: "Sections", icon: Users, permission: "MANAGE_CLASSES" },
      { href: "/school/academics/subjects", label: "Subjects", icon: BookOpen, permission: "MANAGE_CLASSES" },
      { href: "/school/academics/enrollments", label: "Enrollments", icon: ClipboardList, permission: "MANAGE_CLASSES" },
      { href: "/school/exams", label: "Exams & marks", icon: Trophy, permission: "MANAGE_EXAMS" },
    ],
  },
  {
    label: "Learning",
    items: [
      { href: "/school/lessons", label: "Lessons", icon: BookOpen },
      { href: "/school/homework", label: "Homework", icon: ClipboardList },
      { href: "/school/diary", label: "Home diary", icon: NotebookPen },
      { href: "/school/quizzes", label: "Quizzes", icon: FileQuestion },
      { href: "/school/results", label: "Results", icon: Trophy },
      { href: "/school/attendance", label: "Attendance", icon: ClipboardCheck },
      { href: "/school/report-cards", label: "Report cards", icon: CreditCard, permission: "GENERATE_REPORT_CARDS" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/school/fees", label: "Fees", icon: Wallet, permission: "VIEW_FINANCE" },
      { href: "/school/expenses", label: "Salaries & bills", icon: Wallet, permission: "MANAGE_EXPENSES" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/school/setup", label: "Start wizard", icon: Settings, permission: "MANAGE_CLASSES" },
      { href: "/school/id-cards", label: "ID cards", icon: IdCard },
      { href: "/school/announcements", label: "Announcements", icon: Megaphone },
      { href: "/school/events", label: "Events", icon: Calendar },
      { href: "/school/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function SchoolSidebar() {
  const pathname = usePathname();
  const { user, logout, can } = useAuth();

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r bg-card print:hidden">
      <div className="border-b px-6 py-5">
        <BrandMark subtitle={user?.roles.includes("PRINCIPAL") ? "Principal" : "Administration"} />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3 scrollbar-thin">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (!items.length) return null;
          return (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-1">
              {items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
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
            </div>
          </div>
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
