"use client";

import { TeacherGuard } from "@/components/auth/auth-guard";
import { TeacherShell } from "@/components/layout/teacher-sidebar";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TeacherGuard>
      <TeacherShell>{children}</TeacherShell>
    </TeacherGuard>
  );
}
