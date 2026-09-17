"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Search, Unlock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { formatDate } from "@/lib/utils";
import { personFullName } from "@/lib/person-name";

function kindLabel(kind: "PAPER" | "SCORE" | "BOTH") {
  if (kind === "PAPER") return "Paper submission";
  if (kind === "SCORE") return "Score entry";
  return "Paper & scores";
}

export default function ExamDeadlineExtensionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [examConfigId, setExamConfigId] = useState("");
  const [kind, setKind] = useState<"paper" | "score" | "both">("paper");
  const [days, setDays] = useState<"1" | "2" | "3">("1");

  const pendingRequests = useQuery({
    queryKey: ["exam-deadline-extension-requests"],
    queryFn: () => academicsService.listExamDeadlineExtensionRequests(),
  });

  const teachers = useQuery({
    queryKey: ["teachers-search", search],
    queryFn: () => teachersService.list({ search, limit: 20, status: "ACTIVE" }),
    enabled: search.trim().length >= 2,
  });

  const teacher = useQuery({
    queryKey: ["teacher", teacherId],
    queryFn: () => teachersService.getById(teacherId),
    enabled: Boolean(teacherId),
  });

  const examConfigs = useQuery({
    queryKey: ["exam-configs-extensions"],
    queryFn: () => academicsService.listExamConfigs(),
  });

  const approve = useMutation({
    mutationFn: (requestId: string) => academicsService.approveExamDeadlineExtensionRequest(requestId),
    onSuccess: (res) => {
      toast({
        title: `Approved for ${res.teacherName}`,
        description: `All classes and subjects reopened until ${formatDate(res.unlockedUntil)} (${res.assignmentCount} assignment${res.assignmentCount === 1 ? "" : "s"}).`,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["exam-deadline-extension-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-exam-paper-assignments"] });
    },
    onError: (err: Error) => toast({ title: "Could not approve", description: err.message, variant: "error" }),
  });

  const extend = useMutation({
    mutationFn: () => {
      if (!teacher.data?.user.id || !examConfigId) {
        throw new Error("Select teacher and exam");
      }
      return academicsService.extendExamDeadlines({
        teacherUserId: teacher.data.user.id,
        examConfigId,
        kind,
        days: Number(days) as 1 | 2 | 3,
      });
    },
    onSuccess: (res) => {
      toast({
        title: `Reopened for ${res.teacherName}`,
        description: `All classes and subjects reopened until ${formatDate(res.unlockedUntil)} (${res.assignmentCount} assignment${res.assignmentCount === 1 ? "" : "s"}).`,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["my-exam-paper-assignments"] });
    },
    onError: (err: Error) => toast({ title: "Could not extend", description: err.message, variant: "error" }),
  });

  const pickTeacher = (id: string) => {
    setTeacherId(id);
    setExamConfigId("");
    setSearch("");
  };

  const requests = pendingRequests.data ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Exam deadline extensions"
        description="Approving or manually allowing access reopens all of that teacher's classes and subjects for the selected exam."
      />

      <section className="mb-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pending teacher requests
          </h2>
          {requests.length > 0 ? <Badge variant="warning">{requests.length} waiting</Badge> : null}
        </div>

        {pendingRequests.isLoading ? <PageLoader variant="panel" task="exams" /> : null}

        {!pendingRequests.isLoading && requests.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No pending requests right now.
          </p>
        ) : null}

        <div className="space-y-3">
          {requests.map((row) => (
            <article key={row.id} className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{row.teacherName}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.examName} · requested from {row.className} · {row.subjectName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {kindLabel(row.kind)} · {row.days} day{row.days === 1 ? "" : "s"} ·{" "}
                    {formatDate(row.requestedAt)} · applies to all classes & subjects
                  </p>
                </div>
                <Button
                  onClick={() => approve.mutate(row.id)}
                  disabled={approve.isPending}
                  className="shrink-0"
                >
                  <Check className="h-4 w-4" />
                  {approve.isPending ? "Approving…" : `Allow ${row.days} day${row.days === 1 ? "" : "s"}`}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="mb-6 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Extensions last 1–3 days from today (until 11:59 PM) and apply to every class and subject that teacher handles for that exam.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Manually allow a teacher
          </h2>
          <div className="space-y-2">
            <Label htmlFor="teacher-search">Search by name</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="teacher-search"
                className="pl-9"
                placeholder="Type at least 2 letters…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {teachers.isFetching ? <PageLoader variant="panel" task="teacher" /> : null}

          {teacher.data ? (
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="font-medium">{personFullName(teacher.data.user.firstName, teacher.data.user.lastName)}</p>
              <p className="text-sm text-muted-foreground">{teacher.data.user.email}</p>
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setTeacherId("")}>
                Change teacher
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {(teachers.data?.items ?? []).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => pickTeacher(row.id)}
                  className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span>
                    <span className="font-medium">{personFullName(row.user.firstName, row.user.lastName)}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{row.user.email}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Grant access</h2>

          {!teacherId ? (
            <p className="text-sm text-muted-foreground">Select a teacher first.</p>
          ) : teacher.isLoading ? (
            <PageLoader variant="panel" task="teacher" />
          ) : (
            <>
              <div className="space-y-2">
                <Label>Exam</Label>
                <Select value={examConfigId} onChange={(e) => setExamConfigId(e.target.value)}>
                  <option value="">Select exam</option>
                  {(examConfigs.data ?? []).map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name}
                      {exam.startDate ? ` · ${formatDate(exam.startDate)}` : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reopen</Label>
                <Select value={kind} onChange={(e) => setKind(e.target.value as "paper" | "score" | "both")}>
                  <option value="paper">Paper submission only</option>
                  <option value="score">Score entry only</option>
                  <option value="both">Both paper & scores</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>For how many days?</Label>
                <Select value={days} onChange={(e) => setDays(e.target.value as "1" | "2" | "3")}>
                  <option value="1">1 day</option>
                  <option value="2">2 days</option>
                  <option value="3">3 days</option>
                </Select>
              </div>

              <Button
                className="w-full sm:w-auto"
                onClick={() => extend.mutate()}
                disabled={extend.isPending || !examConfigId}
              >
                <Unlock className="h-4 w-4" />
                {extend.isPending ? "Allowing…" : "Allow access"}
              </Button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
