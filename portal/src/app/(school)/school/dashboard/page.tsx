"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { dashboardService } from "@/services/dashboard.service";
import { PageLoader } from "@/components/layout/page-loader";
import { useAuth } from "@/providers/auth-provider";
import { TeacherProgressPanel } from "@/components/teachers/teacher-progress-panel";
import { formatPkr } from "@/lib/money";
import { personFullName } from "@/lib/person-name";
import { cn, formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  GraduationCap,
  Search,
  UserPlus,
  UserSquare2,
  Users,
  Wallet,
} from "lucide-react";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function StatCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-2xl border border-slate-200 bg-gradient-to-br p-4 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md",
        tone,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <span className="rounded-xl bg-white p-2.5 text-teal-700 shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <span className="mt-3 inline-flex items-center text-xs font-semibold text-teal-700">
        Open <ArrowRight className="ml-0.5 h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function MonthlyFeeCollection({
  months,
}: {
  months: Array<{ label: string; collected: number }>;
}) {
  const max = Math.max(1, ...months.map((month) => month.collected));
  return (
    <div className="flex h-56 items-end gap-3">
      {months.map((month) => (
        <div key={month.label} className="flex min-w-0 flex-1 flex-col items-center">
          <p className="mb-2 text-xs font-medium text-slate-700">{formatPkr(month.collected)}</p>
          <div className="flex h-40 w-full items-end justify-center">
            <div
              className="w-full max-w-12 rounded-t-md bg-teal-600"
              style={{ height: `${Math.max(month.collected ? 8 : 3, (month.collected / max) * 100)}%` }}
              title={`${month.label}: ${formatPkr(month.collected)}`}
            />
          </div>
          <p className="mt-2 truncate text-xs text-slate-500">{month.label}</p>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="font-display text-lg text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function SchoolDashboardPage() {
  const { can, user } = useAuth();
  const dashboard = useQuery({
    queryKey: ["school-dashboard"],
    queryFn: () => dashboardService.school(),
  });
  const data = dashboard.data;
  const missingTeachers = useMemo(
    () => (data?.classTeachers ?? []).filter((row) => !row.classTeacher),
    [data?.classTeachers],
  );
  const attendance = data?.attendanceToday;
  const studentsPresent = (attendance?.present ?? 0) + (attendance?.late ?? 0);
  const teachersCheckedIn =
    data?.teacherAttendanceToday?.checkedIn ??
    (data?.teacherAttendanceToday?.present ?? 0) + (data?.teacherAttendanceToday?.late ?? 0);
  const monthName = new Date().toLocaleString("en", { month: "long" });
  const examSubmissions = data?.examPaperSubmissions;
  const pendingSubmissionPreview = examSubmissions?.pendingTeachers.slice(0, 5) ?? [];
  const pendingSubmissionCount = examSubmissions?.pendingTeachers.length ?? 0;

  if (dashboard.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" phrases={["Counting students", "Checking fees", "Almost ready"]} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{todayLabel()}</p>
            <h1 className="mt-1 font-display text-lg text-slate-900">
              {greeting()}
              {user?.firstName ? `, ${personFullName(user.firstName, user.lastName)}` : ""}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {attendance && attendance.marked > 0
                ? `Today ${attendance.present} present · ${attendance.absent} absent · ${attendance.rate}%`
                : "Attendance for today has not been marked yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("SEARCH_STUDENTS") ? (
              <Link href="/school/students">
                <Button variant="outline">
                  <Search className="h-4 w-4" />
                  Find a student
                </Button>
              </Link>
            ) : null}
            {can("VIEW_FINANCE") ? (
              <Link href="/school/fees">
                <Button>
                  <Wallet className="h-4 w-4" />
                  Collect fees
                </Button>
              </Link>
            ) : null}
            {!data?.setupCompleted && can("MANAGE_CLASSES") ? (
              <Link href="/school/setup/wizard">
                <Button variant="secondary">Finish setup</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard
          href="/school/students?status=ACTIVE"
          label="Students"
          value={data ? `${studentsPresent} / ${data.studentCount}` : "—"}
          hint="Present today / on roll"
          icon={GraduationCap}
          tone="from-teal-500/10 via-white to-white"
        />
        <StatCard
          href="/school/teachers/attendance"
          label="Teachers"
          value={data ? `${teachersCheckedIn} / ${data.teacherCount}` : "—"}
          hint="Checked in today / staff"
          icon={UserSquare2}
          tone="from-sky-500/10 via-white to-white"
        />
        <StatCard
          href="/school/academics/grades"
          label="Classes"
          value={data?.classCount ?? "—"}
          hint={`${data?.classTeachers.length ?? 0} sections`}
          icon={Users}
          tone="from-violet-500/10 via-white to-white"
        />
        <StatCard
          href="/school/fees?view=collected"
          label="Collected"
          value={data ? formatPkr(data.feesCollectedThisMonth) : "—"}
          hint={`${monthName} month`}
          icon={Wallet}
          tone="from-emerald-500/10 via-white to-white"
        />
        <StatCard
          href="/school/fees?view=due"
          label="Still due"
          value={data ? formatPkr(data.feesRemainingThisMonth) : "—"}
          hint={`${monthName} unpaid`}
          icon={CalendarCheck}
          tone="from-amber-500/12 via-white to-white"
        />
      </div>

      {can("VIEW_TEACHER_PROGRESS") ? <TeacherProgressPanel /> : null}

      {examSubmissions?.focusExam ? (
        <Panel
          title="Exam paper submissions"
          action={
            <Link href="/school/submitted-exam-papers" className="text-sm font-medium text-teal-700 hover:underline">
              See all
            </Link>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{examSubmissions.focusExam.name}</p>
                <p className="text-sm text-slate-500">
                  Exam date {formatDate(examSubmissions.focusExam.examDate)} · submit by{" "}
                  {formatDate(examSubmissions.focusExam.deadline)} (
                  {examSubmissions.submissionDaysBefore} days before)
                </p>
              </div>
              <p className="text-lg font-semibold text-slate-900">
                {examSubmissions.submitted} / {examSubmissions.expected} submitted
              </p>
            </div>
            {examSubmissions.pendingTeachers.length ? (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Still waiting on{" "}
                  <span className="font-normal text-slate-500">
                    (showing {pendingSubmissionPreview.length} of {pendingSubmissionCount})
                  </span>
                </p>
                <ul className="space-y-2 text-sm">
                  {pendingSubmissionPreview.map((row, index) => (
                    <li key={`${row.teacherName}-${row.className}-${index}`} className="rounded-md border px-3 py-2">
                      <span className="font-medium text-slate-900">{row.teacherName}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {row.subject} · {row.className} · {row.examName}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-emerald-700">All teachers have submitted papers for this exam.</p>
            )}
          </div>
        </Panel>
      ) : null}

      {missingTeachers.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-amber-950">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {missingTeachers.length} class{missingTeachers.length === 1 ? "" : "es"} still need a class teacher
          </p>
          <Link href="/school/academics/grades" className="text-sm font-medium text-amber-900 hover:underline">
            Assign now
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href="/school/students/new">
          <Button variant="outline" size="sm">
            <UserPlus className="h-4 w-4" />
            Add student
          </Button>
        </Link>
        <Link href="/school/students?status=ACTIVE">
          <Button variant="outline" size="sm">
            All students
          </Button>
        </Link>
        {can("MANAGE_EXPENSES") ? (
          <Link href="/school/expenses">
            <Button variant="outline" size="sm">
              Salaries & bills
            </Button>
          </Link>
        ) : null}
        {can("MANAGE_CLASSES") ? (
          <Link href="/school/academics/grades">
            <Button variant="outline" size="sm">
              Manage classes
            </Button>
          </Link>
        ) : null}
      </div>

      <Panel
        title="Classes"
        action={
          <Link href="/school/academics/grades" className="text-sm font-medium text-teal-700 hover:underline">
            View all
          </Link>
        }
      >
        {(data?.classTeachers ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No classes yet. Finish setup to add them.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.classTeachers ?? []).map((row) => (
              <Link
                key={row.sectionId}
                href={`/school/classes/${row.sectionId}`}
                className="rounded-xl border border-slate-200 p-3 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm"
              >
                <p className="font-medium text-slate-900">{row.className}</p>
                <p className="mt-0.5 text-xs text-slate-500">{row.students} students</p>
                <p className={cn("mt-2 text-sm", row.classTeacher ? "text-slate-700" : "text-amber-700")}>
                  {row.classTeacher ?? "No class teacher"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {can("VIEW_FINANCE") ? (
        <Panel
          title="Monthly fee collection"
          action={
            <Link href="/school/fees?view=collected">
              <Button size="sm" variant="outline">
                View receipts
              </Button>
            </Link>
          }
        >
          {(data?.financeMonths ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No fee collections recorded yet.</p>
          ) : (
            <MonthlyFeeCollection months={data?.financeMonths ?? []} />
          )}
        </Panel>
      ) : null}
    </div>
  );
}
