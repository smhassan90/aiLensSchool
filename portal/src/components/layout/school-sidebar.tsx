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

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/school/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/school/front-desk", label: "Front desk", icon: Search },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/school/students", label: "Students", icon: GraduationCap },
      { href: "/school/parents", label: "Parents", icon: Users },
      { href: "/school/teachers", label: "Teachers", icon: UserSquare2 },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/school/academics/years", label: "Academic Years", icon: Calendar },
      { href: "/school/academics/grades", label: "Classes", icon: BookOpen },
      { href: "/school/academics/sections", label: "Sections", icon: Users },
      { href: "/school/academics/subjects", label: "Subjects", icon: BookOpen },
      { href: "/school/academics/enrollments", label: "Enrollments", icon: ClipboardList },
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
      { href: "/school/report-cards", label: "Report cards", icon: CreditCard },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/school/fees", label: "Fees", icon: Wallet },
      { href: "/school/id-cards", label: "ID cards", icon: IdCard },
      { href: "/school/announcements", label: "Announcements", icon: Megaphone },
      { href: "/school/events", label: "Events", icon: Calendar },
      { href: "/school/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function SchoolSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-card print:hidden">
      <div className="border-b px-6 py-5">
        <BrandMark subtitle="Administration" />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3 scrollbar-thin">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
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
        ))}
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
    <div className="flex min-h-screen bg-background">
      <SchoolSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center border-b px-6 py-3 print:hidden">
          <GlobalSearch />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
