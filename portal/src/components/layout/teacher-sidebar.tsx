"use client";

import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  LayoutDashboard,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarFrame, SidebarNavItem } from "@/components/layout/sidebar-frame";

const navItems = [
  { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/classes", label: "My classes", icon: Users },
  { href: "/teacher/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/teacher/lessons", label: "Lessons", icon: BookOpen },
  { href: "/teacher/homework", label: "Homework", icon: ClipboardList },
  { href: "/teacher/quizzes", label: "Quizzes", icon: FileQuestion },
  { href: "/teacher/marks", label: "Tests & reports", icon: Trophy },
  { href: "/teacher/profile", label: "Profile", icon: User },
];

export function TeacherSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <SidebarFrame
      subtitle="Teacher Hub"
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

export function TeacherShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      inverted
      sidebar={<TeacherSidebar />}
      header={<p className="truncate text-sm font-medium text-muted-foreground">Teacher Hub</p>}
    >
      {children}
    </AppShell>
  );
}
