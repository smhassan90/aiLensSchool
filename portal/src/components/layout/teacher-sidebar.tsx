"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  LayoutDashboard,
  LogOut,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { BrandMark } from "@/components/brand/brand-mark";
import { AppShell } from "@/components/layout/app-shell";

const navItems = [
  { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/classes", label: "My Classes", icon: Users },
  { href: "/teacher/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/teacher/lessons", label: "Today's Lessons", icon: BookOpen },
  { href: "/teacher/homework", label: "Homework", icon: ClipboardList },
  { href: "/teacher/quizzes", label: "Quizzes", icon: FileQuestion },
  { href: "/teacher/marks", label: "Marks", icon: Trophy },
  { href: "/teacher/results", label: "Results", icon: Trophy },
  { href: "/teacher/profile", label: "Profile", icon: User },
];

export function TeacherSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r bg-card">
      <div className="border-b px-6 py-5">
        <BrandMark subtitle="Teacher Hub" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
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

export function TeacherShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      sidebar={<TeacherSidebar />}
      header={<p className="truncate text-sm font-medium text-muted-foreground">Teacher Hub</p>}
    >
      {children}
    </AppShell>
  );
}
