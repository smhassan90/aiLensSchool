"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ReportCardSheet } from "@/components/report-cards/report-card-sheet";
import { formatPkr } from "@/lib/money";
import { personFullName, teacherDisplayNameFromUser } from "@/lib/person-name";
import { cn, formatDate } from "@/lib/utils";
import type { ReportCard } from "@/lib/types";
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  KeyRound,
  Sparkles,
  Wallet,
} from "lucide-react";

export type Student360Data = {
  student: {
    id?: string;
    firstName: string;
    lastName: string;
    studentCode: string;
    admissionNumber?: string;
    status: string;
    scienceGroup?: string | null;
    grade?: { name: string; level?: number } | null;
    section?: {
      name: string;
      classTeacher?: {
        id: string;
        gender?: string | null;
        user?: { firstName?: string | null; lastName?: string | null } | null;
      } | null;
    } | null;
    academicYear?: { name: string } | null;
    parents?: Array<{
      relationship: string;
      parent: {
        id: string;
        phone?: string | null;
        user: {
          firstName: string;
          lastName: string;
          email?: string;
          username?: string;
          phone?: string;
        };
      };
    }>;
  };
  attendance: {
    total: number;
    present: number;
    absent: number;
    late: number;
    rate: number;
    recent: Array<{ date: string; status: string }>;
  };
  quizzes: {
    average: number;
    results: Array<{
      id: string;
      title: string;
      subject: string;
      percentage: number;
      submittedAt: string;
    }>;
  };
  homework: Array<{ id: string; title: string; dueDate: string; subject?: { name: string } }>;
  diaries: Array<{
    id: string;
    date: string;
    title: string;
    lessonSummary: string;
    homeworkNotes: string;
  }>;
  reportCards: Array<ReportCard>;
  fees: {
    billed: number;
    paid: number;
    due: number;
    items: Array<{
      id: string;
      periodLabel: string;
      status: string;
      amount: number;
      paidAmount: number;
    }>;
  };
};

type SectionId = "attendance" | "quizzes" | "fees" | "diary" | "reports";

function initials(first?: string | null, last?: string | null) {
  const a = (first ?? "").trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "S";
}

function scrollToSection(id: SectionId) {
  document.getElementById(`s360-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
  className,
}: {
  id?: string;
  title: string;
  icon: typeof CalendarCheck;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
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

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/70 px-4 py-4 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.45)]",
        tone,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

function InteractiveRow({
  children,
  onClick,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "group flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-left text-sm shadow-[0_8px_24px_-20px_rgba(15,23,42,0.4)] transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md";
  const body = (
    <>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{children}</div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-teal-600" />
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function pickFather(parents: NonNullable<Student360Data["student"]["parents"]>) {
  return (
    parents.find((p) => p.relationship === "FATHER") ??
    parents.find((p) => p.relationship === "GUARDIAN") ??
    parents[0] ??
    null
  );
}

export function Student360View({
  data,
  studentId,
  backHref,
  backLabel = "Back",
  onMarkPaid,
  markPaidPending,
  onScienceGroupChange,
  scienceGroupPending,
  onResetParentPassword,
  resetParentPasswordPending,
  parentPasswordReset,
  showFullProfileLink = false,
}: {
  data: Student360Data;
  studentId: string;
  backHref?: string;
  backLabel?: string;
  onMarkPaid?: (studentFeeId: string) => void;
  markPaidPending?: boolean;
  onScienceGroupChange?: (value: string) => void;
  scienceGroupPending?: boolean;
  onResetParentPassword?: (parentProfileId: string) => void;
  resetParentPasswordPending?: boolean;
  parentPasswordReset?: {
    username: string | null;
    temporaryPassword: string;
  } | null;
  showFullProfileLink?: boolean;
}) {
  const student = data.student;
  const fullName = personFullName(student.firstName, student.lastName);
  const classTeacher = student.section?.classTeacher;
  const father = pickFather(student.parents ?? []);
  const fatherName = father
    ? personFullName(father.parent.user.firstName, father.parent.user.lastName)
    : "";
  const fatherPhone = father?.parent.phone || father?.parent.user.phone || "";
  const fatherLogin = father?.parent.user.username || "";
  const needsStream =
    student.grade?.level === 9 ||
    student.grade?.level === 10 ||
    /\b(9|10|ix|x)\b/i.test(student.grade?.name ?? "");
  const feePaidPct = useMemo(() => {
    if (!data.fees.billed) return 0;
    return Math.round((data.fees.paid / data.fees.billed) * 100);
  }, [data.fees.billed, data.fees.paid]);

  const stats: Array<{
    id: SectionId;
    label: string;
    value: ReactNode;
    hint: string;
    meter?: number;
    tone: string;
    bar: string;
    icon: typeof CalendarCheck;
  }> = [
    {
      id: "attendance",
      label: "Attendance",
      value: `${data.attendance.rate}%`,
      hint: `${data.attendance.present} present · ${data.attendance.absent} absent`,
      meter: data.attendance.rate,
      tone: "from-teal-500/12 via-white to-white",
      bar: "bg-teal-600",
      icon: CalendarCheck,
    },
    {
      id: "quizzes",
      label: "Quiz average",
      value: `${data.quizzes.average}%`,
      hint: `${data.quizzes.results.length} recent results`,
      meter: data.quizzes.average,
      tone: "from-sky-500/12 via-white to-white",
      bar: "bg-sky-600",
      icon: BookOpen,
    },
    {
      id: "fees",
      label: "Fees due",
      value: formatPkr(data.fees.due),
      hint: `${formatPkr(data.fees.paid)} paid of ${formatPkr(data.fees.billed)}`,
      meter: feePaidPct,
      tone: "from-amber-500/15 via-white to-white",
      bar: "bg-amber-500",
      icon: Wallet,
    },
    {
      id: "diary",
      label: "Status",
      value: (
        <Badge
          variant={student.status === "ACTIVE" ? "success" : "secondary"}
          className="px-2.5 py-1 text-sm"
        >
          {student.status}
        </Badge>
      ),
      hint: "Diary, homework & reports",
      tone: "from-violet-500/12 via-white to-white",
      bar: "bg-violet-500",
      icon: GraduationCap,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 text-white shadow-[0_24px_60px_-28px_rgba(15,118,110,0.65)]">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-teal-400/30 blur-3xl" />
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-32 w-56 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-teal-300 font-display text-lg font-semibold text-teal-950 shadow-lg shadow-black/20">
              {initials(student.firstName, student.lastName)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200/90">Student 360</p>
              <h1 className="mt-1 font-display text-lg text-white">
                <span className="truncate">{fullName}</span>
                {fatherName ? <span className="text-teal-100"> / {fatherName}</span> : null}
              </h1>
              <p className="mt-1 text-sm text-teal-50/90">
                {[
                  fatherPhone ? `Mobile ${fatherPhone}` : null,
                  fatherLogin ? `App login ${fatherLogin}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No father contact linked"}
              </p>
              {father && onResetParentPassword ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => onResetParentPassword(father.parent.id)}
                  disabled={resetParentPasswordPending}
                >
                  <KeyRound className="h-4 w-4" />
                  {resetParentPasswordPending ? "Resetting…" : "Reset parent password"}
                </Button>
              ) : null}
              {parentPasswordReset ? (
                <div className="mt-3 max-w-md rounded-xl border border-amber-200/30 bg-amber-100/10 p-3 text-sm text-amber-50">
                  <p className="font-semibold">Temporary parent password</p>
                  <p className="mt-1">
                    {(parentPasswordReset.username ?? fatherLogin) || "Parent"}:{" "}
                    <span className="font-mono font-semibold">{parentPasswordReset.temporaryPassword}</span>
                  </p>
                  <p className="mt-1 text-xs text-amber-100/80">Share this securely. The parent must change it after login.</p>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">{student.studentCode}</span>
                {student.admissionNumber && student.admissionNumber !== student.studentCode ? (
                  <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                    Adm. {student.admissionNumber}
                  </span>
                ) : null}
                <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                  {student.grade?.name ?? "Unassigned"} {student.section?.name ?? ""}
                </span>
                {classTeacher?.user ? (
                  <span className="rounded-full bg-amber-300/20 px-3 py-1 text-amber-50 backdrop-blur">
                    Class teacher {teacherDisplayNameFromUser(classTeacher.user, classTeacher.gender)}
                  </span>
                ) : null}
                {needsStream && onScienceGroupChange ? (
                  <Select
                    className="h-8 w-auto border-white/20 bg-white/10 text-white"
                    value={student.scienceGroup ?? ""}
                    onChange={(e) => onScienceGroupChange(e.target.value)}
                    disabled={scienceGroupPending}
                  >
                    <option value="">Science group</option>
                    <option value="COMPUTER">Comp. science</option>
                    <option value="BIOLOGY">Bio. science</option>
                  </Select>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {backHref ? (
              <Link href={backHref}>
                <Button
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {backLabel}
                </Button>
              </Link>
            ) : null}
            {showFullProfileLink ? (
              <Link href={`/school/students/${studentId}`}>
                <Button className="bg-amber-300 text-teal-950 hover:bg-amber-200">Open full profile</Button>
              </Link>
            ) : (
              <Link href={`/school/fees?studentId=${studentId}`}>
                <Button className="bg-amber-300 text-teal-950 hover:bg-amber-200">
                  <Wallet className="h-4 w-4" />
                  Collect fees
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.id}
              type="button"
              onClick={() => scrollToSection(stat.id)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br p-4 text-left transition-all duration-300",
                stat.tone,
                "hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
                  <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{stat.value}</div>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500">{stat.hint}</p>
                </div>
                <span className="rounded-xl bg-white p-2.5 text-teal-700 shadow-sm transition-transform group-hover:scale-105">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              {stat.meter != null ? <Meter value={stat.meter} tone={stat.bar} /> : <div className="mt-3 h-1.5" />}
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-teal-700">
                Jump to section <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel id="s360-attendance" title="Attendance" icon={CalendarCheck}>
              <div className="mb-5 grid gap-4 sm:grid-cols-3">
                <MetricTile
                  label="Present"
                  value={data.attendance.present}
                  tone="bg-emerald-50 text-emerald-800"
                />
                <MetricTile
                  label="Absent"
                  value={data.attendance.absent}
                  tone="bg-rose-50 text-rose-800"
                />
                <MetricTile label="Late" value={data.attendance.late} tone="bg-amber-50 text-amber-800" />
              </div>
              <div className="space-y-3">
                {data.attendance.recent.map((row) => (
                  <InteractiveRow key={row.date}>
                    <span className="font-medium text-slate-800">{formatDate(row.date)}</span>
                    <Badge
                      variant={
                        row.status === "PRESENT"
                          ? "success"
                          : row.status === "ABSENT"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {row.status}
                    </Badge>
                  </InteractiveRow>
                ))}
                {!data.attendance.recent.length ? <EmptyState>No attendance yet.</EmptyState> : null}
              </div>
            </Panel>

            <Panel
              id="s360-fees"
              title="Fees"
              icon={Wallet}
              action={
                <Link href={`/school/fees?studentId=${studentId}`}>
                  <Button className="shadow-sm">Collect fees</Button>
                </Link>
              }
            >
              <div className="mb-5 grid gap-4 sm:grid-cols-3">
                <MetricTile label="Due" value={formatPkr(data.fees.due)} tone="bg-amber-50 text-amber-900" />
                <MetricTile label="Paid" value={formatPkr(data.fees.paid)} tone="bg-emerald-50 text-emerald-900" />
                <MetricTile
                  label="Billed"
                  value={formatPkr(data.fees.billed)}
                  tone="bg-slate-100 text-slate-800"
                />
              </div>
              <div className="space-y-3">
                {data.fees.items.length === 0 ? (
                  <EmptyState>No fee records yet.</EmptyState>
                ) : (
                  data.fees.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.4)]"
                    >
                      <Link
                        href={`/school/fees?studentId=${studentId}`}
                        className="min-w-0 text-left hover:underline"
                      >
                        <span className="font-medium text-slate-900">{item.periodLabel}</span>
                        <span className="ml-2 text-slate-500">
                          {formatPkr(item.paidAmount)}/{formatPkr(item.amount)} · {item.status}
                        </span>
                      </Link>
                      {item.status !== "PAID" && onMarkPaid ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onMarkPaid(item.id)}
                          disabled={markPaidPending}
                        >
                          Mark paid
                        </Button>
                      ) : (
                        <Badge variant="success">Paid</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>

          <Panel
            id="s360-quizzes"
            title="Progress & quizzes"
            icon={Sparkles}
          >
            {data.quizzes.results.length === 0 ? (
              <EmptyState>No quiz results yet — scores will appear here.</EmptyState>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Score trend
                  </p>
                  {data.quizzes.results.map((r) => (
                    <div
                      key={`trend-${r.id}`}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{r.subject}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{r.title}</p>
                        </div>
                        <span className="shrink-0 font-semibold text-teal-800">{r.percentage}%</span>
                      </div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-teal-600 transition-all"
                          style={{ width: `${Math.max(4, Math.min(100, r.percentage))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Recent results
                  </p>
                  {data.quizzes.results.map((row) => (
                    <InteractiveRow key={row.id}>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{row.title}</p>
                        <p className="text-slate-500">
                          {row.subject} · {formatDate(row.submittedAt)}
                        </p>
                      </div>
                      <Badge className="bg-teal-100 text-teal-800">{row.percentage}%</Badge>
                    </InteractiveRow>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <div id="s360-diary" className="grid scroll-mt-4 gap-6 lg:grid-cols-2">
            <Panel title="Diary" icon={FileText}>
              <div className="space-y-3">
                {data.diaries.length === 0 ? (
                  <EmptyState>No diary entries yet.</EmptyState>
                ) : (
                  data.diaries.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="w-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left text-sm shadow-[0_8px_24px_-20px_rgba(15,23,42,0.4)] transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
                    >
                      <p className="font-semibold text-slate-900">{formatDate(d.date)}</p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-600">{d.lessonSummary}</p>
                      <p className="mt-2 text-slate-700">
                        <span className="font-medium text-teal-800">Homework:</span> {d.homeworkNotes}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </Panel>
            <Panel title="Homework" icon={ClipboardList}>
              <div className="space-y-3">
                {data.homework.length === 0 ? (
                  <EmptyState>No homework yet.</EmptyState>
                ) : (
                  data.homework.map((h) => (
                    <InteractiveRow key={h.id}>
                      <span className="min-w-0 truncate font-medium text-slate-900">
                        {h.subject?.name}: {h.title}
                      </span>
                      <span className="shrink-0 text-slate-500">due {formatDate(h.dueDate)}</span>
                    </InteractiveRow>
                  ))
                )}
              </div>
            </Panel>
          </div>

          <div id="s360-reports" className="scroll-mt-4 space-y-5">
            {data.reportCards.length === 0 ? (
              <Panel title="Report cards" icon={FileText}>
                <EmptyState>No report cards generated yet.</EmptyState>
              </Panel>
            ) : (
              data.reportCards.map((card) => <ReportCardSheet key={card.id} card={card} />)
            )}
          </div>
      </div>
    </div>
  );
}
