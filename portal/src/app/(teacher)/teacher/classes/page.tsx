"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { teachersService } from "@/services/teachers.service";
import type { TeacherClass } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BarChart3, BookOpen, ChevronRight, GraduationCap, Users } from "lucide-react";

function compareClasses(a: TeacherClass, b: TeacherClass) {
  const grade = a.gradeName.localeCompare(b.gradeName, undefined, { numeric: true, sensitivity: "base" });
  if (grade !== 0) return grade;
  const section = a.sectionName.localeCompare(b.sectionName, undefined, { numeric: true, sensitivity: "base" });
  if (section !== 0) return section;
  return a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" });
}

function rosterHref(cls: TeacherClass) {
  const q = new URLSearchParams({
    grade: cls.gradeName,
    section: cls.sectionName,
    subject: cls.subjectName,
  });
  return `/teacher/classes/section/${cls.sectionId}/students?${q.toString()}`;
}

function ClassAssignmentCard({ cls }: { cls: TeacherClass }) {
  const classLabel = `${cls.gradeName} · ${cls.sectionName}`;
  const count = cls.studentCount ?? 0;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 text-white shadow-[0_24px_60px_-28px_rgba(15,118,110,0.55)]",
        cls.isClassTeacher && "ring-2 ring-amber-300/40 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -left-10 top-0 h-32 w-32 rounded-full bg-teal-400/30 blur-3xl" />
        <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-amber-300/20 blur-3xl" />
      </div>

      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-200/90">My class</p>
            <h2 className="mt-1 font-display text-xl text-white">{classLabel}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/15">
                <BookOpen className="mr-1 h-3 w-3" />
                {cls.subjectName}
              </Badge>
              {cls.isClassTeacher ? (
                <Badge variant="success" className="bg-emerald-500/90 text-white">Class teacher</Badge>
              ) : (
                <Badge variant="secondary" className="border-white/10 bg-white/10 text-teal-50">
                  {cls.role === "ASSISTANT" ? "Assistant" : "Subject teacher"}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br from-amber-200 to-teal-300 shadow-lg shadow-black/20">
            <GraduationCap className="h-7 w-7 text-teal-950" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={rosterHref(cls)}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-teal-500/12 via-white/5 to-transparent p-4 transition-colors hover:border-white/25 hover:bg-white/10"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-teal-100/80">Students</p>
                <p className="mt-1 font-display text-2xl text-white">{count}</p>
                <p className="mt-1 text-xs text-teal-100/70">Tap to view roster</p>
              </div>
              <Users className="h-8 w-8 text-teal-200/60 transition-transform group-hover:scale-105" />
            </div>
            <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40 group-hover:text-white/70" />
          </Link>

          {cls.gradeId ? (
            <Link
              href={`/teacher/classes/${cls.gradeId}/analytics?sectionId=${cls.sectionId}`}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/12 via-white/5 to-transparent p-4 transition-colors hover:border-white/25 hover:bg-white/10"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-100/80">Progress</p>
                  <p className="mt-1 text-sm font-medium text-white">Attendance & quizzes</p>
                  <p className="mt-1 text-xs text-teal-100/70">Class analytics</p>
                </div>
                <BarChart3 className="h-8 w-8 text-sky-200/60 transition-transform group-hover:scale-105" />
              </div>
              <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40 group-hover:text-white/70" />
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <Link href={rosterHref(cls)}>
            <Button size="sm" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Users className="h-4 w-4" />
              Students
            </Button>
          </Link>
          {cls.gradeId ? (
            <Link href={`/teacher/classes/${cls.gradeId}/analytics?sectionId=${cls.sectionId}`}>
              <Button size="sm" variant="outline" className="border-white/25 text-white hover:bg-white/10">
                <BarChart3 className="h-4 w-4" />
                Progress
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function TeacherClassesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const classes = useMemo(
    () =>
      [...new Map(
        (data ?? []).map((cls) => [`${cls.sectionId}:${cls.subjectId}`, cls] as const),
      ).values()].sort(compareClasses),
    [data],
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My Classes"
        description="Your sections and subjects — open a roster or class progress like Student 360."
      />

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      {isLoading ? (
        <PageLoader variant="panel" />
      ) : !classes.length ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No classes assigned"
          description="Contact your school admin to assign subjects and sections."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {classes.map((cls) => (
            <ClassAssignmentCard key={`${cls.sectionId}-${cls.subjectId}`} cls={cls} />
          ))}
        </div>
      )}
    </div>
  );
}
