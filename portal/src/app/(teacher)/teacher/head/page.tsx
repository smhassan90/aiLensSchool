"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  FileText,
  GraduationCap,
  Trophy,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { headTeachersService } from "@/services/head-teachers.service";

const links = [
  { href: "/teacher/head/attendance", label: "Attendance overview", icon: ClipboardCheck },
  { href: "/teacher/head/students", label: "Student search & 360", icon: GraduationCap },
  { href: "/teacher/head/teachers", label: "Teacher progress", icon: Users },
  { href: "/teacher/head/quizzes", label: "Quizzes by teachers", icon: FileQuestion },
  { href: "/teacher/head/exam-papers", label: "Exam papers", icon: FileText },
  { href: "/teacher/head/homework", label: "Homework", icon: ClipboardList },
  { href: "/teacher/head/results", label: "Quiz & exam results", icon: Trophy },
];

export default function HeadTeacherDashboardPage() {
  const dashboard = useQuery({
    queryKey: ["head-teacher-dashboard"],
    queryFn: () => headTeachersService.getDashboard(),
  });

  if (dashboard.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Academic oversight" />
        <PageLoader variant="page" />
      </div>
    );
  }

  const data = dashboard.data;
  if (!data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Academic oversight" />
        <p className="text-sm text-muted-foreground">Head teacher access is not set up for your account.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={data.title}
        description={`Academic oversight for ${data.sections.length} class${data.sections.length === 1 ? "" : "es"}${data.academicYear ? ` · ${data.academicYear.name}` : ""}.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Students</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.stats.students}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Teachers</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.stats.teachers}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">30-day attendance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {data.stats.attendanceRate != null ? `${data.stats.attendanceRate}%` : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Papers to review</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.stats.pendingExamPapers}</CardContent>
        </Card>
      </div>

      <div className="mb-6 rounded-xl border bg-muted/20 p-4">
        <p className="mb-2 text-sm font-medium">Your classes</p>
        <div className="flex flex-wrap gap-2">
          {data.sections.map((section) => (
            <span key={section.id} className="rounded-full border bg-background px-3 py-1 text-sm">
              {section.classLabel}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
          >
            <Icon className="h-5 w-5 text-primary" />
            <span className="font-medium">{label}</span>
          </Link>
        ))}
        <Link
          href="/teacher/lessons"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
        >
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-medium">My own teaching</span>
        </Link>
      </div>
    </div>
  );
}
