"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, GraduationCap, Users } from "lucide-react";
import { PageLoader } from "@/components/layout/page-loader";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { studentsService } from "@/services/students.service";
import { personFullName } from "@/lib/person-name";
import { assetUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function initials(first?: string | null, last?: string | null) {
  const a = (first?.trim()?.[0] ?? "").toUpperCase();
  const b = (last?.trim()?.[0] ?? "").toUpperCase();
  return a + b || "?";
}

export default function TeacherSectionStudentsPage() {
  const params = useParams<{ sectionId: string }>();
  const search = useSearchParams();
  const gradeName = search.get("grade") ?? "Class";
  const sectionName = search.get("section") ?? "";
  const subjectName = search.get("subject") ?? "";

  const rosterQuery = useQuery({
    queryKey: ["teacher-section-students", params.sectionId],
    queryFn: () => studentsService.listAll({ sectionId: params.sectionId, status: "ACTIVE" }),
  });

  const students = useMemo(() => {
    const items = rosterQuery.data?.items ?? [];
    return [...items].sort((a, b) =>
      personFullName(a.firstName, a.lastName).localeCompare(
        personFullName(b.firstName, b.lastName),
        undefined,
        { sensitivity: "base" },
      ),
    );
  }, [rosterQuery.data?.items]);

  const backHref = "/teacher/classes";
  const classLabel = sectionName ? `${gradeName} · ${sectionName}` : gradeName;

  const student360Href = (studentId: string) => {
    const q = new URLSearchParams({
      from: "roster",
      sectionId: params.sectionId,
      grade: gradeName,
      section: sectionName,
      subject: subjectName,
    });
    return `/teacher/students/${studentId}?${q.toString()}`;
  };

  if (rosterQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Students"
        description="Tap a student to open their 360 overview."
        actions={
          <Link href={backHref}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              My classes
            </Button>
          </Link>
        }
      />

      <section className="relative mb-6 overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 text-white shadow-[0_24px_60px_-28px_rgba(15,118,110,0.65)]">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-teal-400/30 blur-3xl" />
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-amber-300/20 blur-3xl" />
        </div>
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br from-amber-200 to-teal-300 shadow-lg shadow-black/20">
              <GraduationCap className="h-8 w-8 text-teal-950" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200/90">Class roster</p>
              <h1 className="mt-1 font-display text-lg text-white">{classLabel}</h1>
              {subjectName ? (
                <p className="mt-1 text-sm text-teal-100/80">{subjectName}</p>
              ) : null}
              <p className="mt-2 flex items-center gap-1.5 text-sm text-teal-100/90">
                <Users className="h-4 w-4" />
                {students.length} student{students.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {rosterQuery.isError ? (
        <p className="text-sm text-destructive">Could not load students for this section.</p>
      ) : !students.length ? (
        <p className="text-sm text-muted-foreground">No active students in this section yet.</p>
      ) : (
        <div className="space-y-2">
          {students.map((student) => {
            const name = personFullName(student.firstName, student.lastName);
            const photo = student.photoUrl ? assetUrl(student.photoUrl) : null;
            return (
              <Link
                key={student.id}
                href={student360Href(student.id)}
                className={cn(
                  "group flex items-center gap-4 rounded-2xl border bg-card p-4 transition-colors",
                  "hover:border-teal-200/60 hover:bg-gradient-to-r hover:from-teal-500/5 hover:to-transparent",
                )}
              >
                <div className="flex h-14 w-11 shrink-0 overflow-hidden rounded-xl border border-teal-900/10 bg-gradient-to-br from-amber-100 to-teal-100">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-teal-900">
                      {initials(student.firstName, student.lastName)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{name}</p>
                  <p className="text-sm text-muted-foreground">{student.studentCode}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-teal-700" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
