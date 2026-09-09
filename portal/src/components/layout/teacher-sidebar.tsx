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
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarFrame, SidebarNavItem } from "@/components/layout/sidebar-frame";
import {
  TeacherBackgroundPrefetch,
  prefetchMenuHref,
} from "@/components/layout/background-prefetch";
import { teachersService } from "@/services/teachers.service";
import { personFullName } from "@/lib/person-name";

const baseNavItems = [
  { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/classes", label: "My classes", icon: Users },
  { href: "/teacher/attendance", label: "Attendance", icon: ClipboardCheck, classTeacherOnly: true },
  { href: "/teacher/lessons", label: "Lessons", icon: BookOpen },
  { href: "/teacher/homework", label: "Homework", icon: ClipboardList },
  { href: "/teacher/quizzes", label: "Quizzes", icon: FileQuestion },
  { href: "/teacher/marks", label: "Tests & reports", icon: Trophy },
  { href: "/teacher/profile", label: "Profile", icon: User },
];

export function TeacherSidebar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });
  const isClassTeacher = (classes.data ?? []).some((row) => row.isClassTeacher);
  const navItems = baseNavItems.filter((item) => !item.classTeacherOnly || isClassTeacher);

  return (
    <SidebarFrame
      subtitle="Teacher Hub"
      userName={personFullName(user?.firstName, user?.lastName)}
      onLogout={logout}
    >
      {navItems.map(({ href, label, icon }) => (
        <SidebarNavItem
          key={href}
          href={href}
          label={label}
          icon={icon}
          active={pathname === href || pathname.startsWith(`${href}/`)}
          onPrefetch={(path) => prefetchMenuHref(queryClient, path)}
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
      <TeacherBackgroundPrefetch />
      {children}
    </AppShell>
  );
}
