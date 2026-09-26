"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  FileText,
  GraduationCap,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HeadTeacherDashboard } from "@/services/head-teachers.service";

const exploreLinks = [
  {
    href: "/teacher/staff-attendance",
    label: "Staff attendance & 360",
    hint: "Teacher check-in and supervised staff overview",
    icon: ClipboardCheck,
  },
  {
    href: "/teacher/head/attendance",
    label: "Student attendance overview",
    hint: "30-day rates by class",
    icon: CalendarCheck,
  },
  {
    href: "/teacher/head/students",
    label: "Student search & 360",
    hint: "Find a student and open their full picture",
    icon: GraduationCap,
  },
  {
    href: "/teacher/head/teachers",
    label: "Teacher progress",
    hint: "Activity and performance in your sections",
    icon: Users,
  },
  {
    href: "/teacher/head/quizzes",
    label: "Quizzes by teachers",
    hint: "Recent quiz activity",
    icon: FileQuestion,
  },
  {
    href: "/teacher/head/exam-papers",
    label: "Exam papers",
    hint: "Submissions waiting for your review",
    icon: FileText,
  },
  {
    href: "/teacher/head/homework",
    label: "Homework",
    hint: "Assignments across your classes",
    icon: ClipboardList,
  },
  {
    href: "/teacher/head/results",
    label: "Quiz & exam results",
    hint: "Outcomes and trends",
    icon: Trophy,
  },
  {
    href: "/teacher/lessons",
    label: "My own teaching",
    hint: "Your lessons and class work",
    icon: BookOpen,
  },
] as const;

function Meter({ value, tone }: { value: number; tone: string }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5">
      <div
        className={cn("h-full rounded-full transition-all duration-500", tone)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function Panel({
  id,
  title,
  icon: Icon,
  action,
  children,
}: {
  id?: string;
  title: string;
  icon: typeof CalendarCheck;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="font-display text-lg text-slate-900">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function InsightLinkRow({
  href,
  label,
  hint,
  icon: Icon,
}: {
  href: string;
  label: string;
  hint: string;
  icon: typeof CalendarCheck;
}) {
  return (
    <Link
      href={href}
      className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-left text-sm shadow-[0_8px_24px_-20px_rgba(15,23,42,0.4)] transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-teal-600" />
    </Link>
  );
}

function StatCard({
  href,
  label,
  value,
  hint,
  meter,
  bar,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint: string;
  meter?: number | null;
  bar: string;
  icon: typeof CalendarCheck;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br p-4 text-left transition-all duration-300",
        tone,
        "hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{value}</div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{hint}</p>
        </div>
        <span className="rounded-xl bg-white p-2.5 text-teal-700 shadow-sm transition-transform group-hover:scale-105">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {meter != null ? <Meter value={meter} tone={bar} /> : <div className="mt-3 h-1.5" />}
      <span className="mt-3 inline-flex items-center text-xs font-semibold text-teal-700">
        Open <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export function AcademicInsightsView({
  data,
  overseerName,
}: {
  data: HeadTeacherDashboard;
  overseerName?: string | null;
}) {
  const classCount = data.sections.length;
  const yearLabel = data.academicYear?.name;
  const attendance = data.stats.attendanceRate;

  const stats = [
    {
      href: "/teacher/head/students",
      label: "Students",
      value: data.stats.students.toLocaleString(),
      hint: `Enrolled across ${classCount} class${classCount === 1 ? "" : "es"}`,
      meter: null,
      bar: "bg-teal-600",
      icon: GraduationCap,
      tone: "from-teal-500/12 via-white to-white",
    },
    {
      href: "/teacher/head/teachers",
      label: "Teachers",
      value: data.stats.teachers.toLocaleString(),
      hint: "Teaching your supervised sections",
      meter: null,
      bar: "bg-sky-600",
      icon: Users,
      tone: "from-sky-500/12 via-white to-white",
    },
    {
      href: "/teacher/head/attendance",
      label: "30-day attendance",
      value: attendance != null ? `${attendance}%` : "—",
      hint: "Student present + late · marked days only",
      meter: attendance,
      bar: "bg-emerald-600",
      icon: CalendarCheck,
      tone: "from-emerald-500/12 via-white to-white",
    },
    {
      href: "/teacher/head/exam-papers",
      label: "Papers to review",
      value: data.stats.pendingExamPapers.toLocaleString(),
      hint: `${data.stats.recentQuizzes} quizzes · ${data.stats.recentHomework} homework (30d)`,
      meter: null,
      bar: "bg-amber-500",
      icon: FileText,
      tone: "from-amber-500/15 via-white to-white",
    },
  ];

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 text-white shadow-[0_24px_60px_-28px_rgba(15,118,110,0.65)]"
      >
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-teal-400/30 blur-3xl" />
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-32 w-56 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br from-amber-200 to-teal-300 shadow-lg shadow-black/20">
              <Sparkles className="h-9 w-9 text-teal-950" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200/90">
                Academic insights
              </p>
              <h1 className="mt-1 font-display text-xl text-white sm:text-2xl">{data.title}</h1>
              <p className="mt-1 text-sm text-teal-50/90">
                {[
                  overseerName ? `Oversight by ${overseerName}` : null,
                  yearLabel ? `Academic year ${yearLabel}` : null,
                  `${classCount} supervised class${classCount === 1 ? "" : "es"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.sections.map((section) => (
                  <span
                    key={section.id}
                    className="rounded-full bg-white/10 px-3 py-1 text-sm backdrop-blur"
                  >
                    {section.classLabel}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/teacher/head/students">
              <Button className="bg-amber-300 text-teal-950 hover:bg-amber-200">
                <GraduationCap className="h-4 w-4" />
                Find a student
              </Button>
            </Link>
            <Link href="/teacher/head/attendance">
              <Button
                variant="outline"
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <CalendarCheck className="h-4 w-4" />
                Attendance
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-5">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel id="hti-classes" title="Your classes" icon={GraduationCap}>
          <div className="flex flex-wrap gap-2">
            {data.sections.map((section) => (
              <span
                key={section.id}
                className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm"
              >
                {section.classLabel}
              </span>
            ))}
          </div>
          {!data.sections.length ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              No classes are linked to your head teacher assignment yet.
            </p>
          ) : null}
        </Panel>

        <Panel
          id="hti-snapshot"
          title="30-day snapshot"
          icon={CalendarCheck}
          action={
            <Link href="/teacher/head/attendance">
              <Button variant="outline" size="sm" className="shadow-sm">Full breakdown</Button>
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-emerald-50 px-4 py-4 text-emerald-900 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Attendance</p>
              <p className="mt-1 text-lg font-semibold">
                {attendance != null ? `${attendance}%` : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-sky-50 px-4 py-4 text-sky-900 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Quizzes</p>
              <p className="mt-1 text-lg font-semibold">{data.stats.recentQuizzes}</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-violet-50 px-4 py-4 text-violet-900 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Homework</p>
              <p className="mt-1 text-lg font-semibold">{data.stats.recentHomework}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Attendance is based on student marks in your sections (present and late count as attended).
            Quiz and homework counts include items created in the last 30 days.
          </p>
        </Panel>
      </div>

      <Panel id="hti-explore" title="Explore" icon={Sparkles}>
        <div className="grid gap-3 sm:grid-cols-2">
          {exploreLinks.map((link) => (
            <InsightLinkRow key={link.href} {...link} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
