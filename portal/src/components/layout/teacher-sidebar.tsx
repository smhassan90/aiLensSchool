"use client";

import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileQuestion,
  FileText,
  LayoutDashboard,
  School,
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
import { headTeachersService } from "@/services/head-teachers.service";
import { personFullName } from "@/lib/person-name";
import { useSchoolBranding } from "@/hooks/use-school-branding";
import { SchoolHeaderBar } from "@/components/layout/school-header-bar";

const baseNavItems = [
  { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/my-attendance", label: "My attendance", icon: Clock },
  { href: "/teacher/classes", label: "My classes", icon: Users },
  { href: "/teacher/attendance", label: "Class attendance", icon: ClipboardCheck, classTeacherOnly: true },
  { href: "/teacher/day-off-requests", label: "Day-off requests", icon: CalendarDays, classTeacherOnly: true },
  { href: "/teacher/lessons", label: "Lessons", icon: BookOpen },
  { href: "/teacher/homework", label: "Homework", icon: ClipboardList },
  { href: "/teacher/quizzes", label: "Quizzes", icon: FileQuestion },
  { href: "/teacher/exams", label: "Exam papers", icon: FileText },
  { href: "/teacher/marks/exam", label: "Tests & reports", icon: Trophy },
  { href: "/teacher/profile", label: "Profile", icon: User },
];

export function TeacherSidebar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { schoolName, schoolLogo } = useSchoolBranding();
  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });
  const headTeacher = useQuery({
    queryKey: ["head-teacher-me"],
    queryFn: () => headTeachersService.getMyAssignment(),
  });
  const supervision = useQuery({
    queryKey: ["teacher-supervision"],
    queryFn: () => teachersService.getSupervision(),
  });
  const isClassTeacher = (classes.data ?? []).some((row) => row.isClassTeacher);
  const isHeadTeacher = Boolean(headTeacher.data?.sections?.length);
  const supervisesStaff = (supervision.data?.supervisedTeachers.length ?? 0) > 0;
  const teacherNavItems = baseNavItems.filter((item) => !item.classTeacherOnly || isClassTeacher);
  const dashboard = teacherNavItems.find((item) => item.href === "/teacher/dashboard");
  const restNavItems = teacherNavItems.filter((item) => item.href !== "/teacher/dashboard");
  const navItems = [
    ...(dashboard ? [dashboard] : []),
    ...(isHeadTeacher
      ? [{ href: "/teacher/head", label: "Academic insights", icon: School }]
      : []),
    ...(supervisesStaff
      ? [{ href: "/teacher/staff-attendance", label: "Staff attendance", icon: Users }]
      : []),
    ...restNavItems,
  ];

  return (
    <SidebarFrame
      subtitle="Teacher Hub"
      userName={personFullName(user?.firstName, user?.lastName)}
      schoolName={schoolName}
      schoolLogo={schoolLogo}
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
      header={<SchoolHeaderBar />}
    >
      <TeacherBackgroundPrefetch />
      {children}
    </AppShell>
  );
}
