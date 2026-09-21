"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { ExamPaperTeacherSummary } from "@/components/exams/exam-paper-teacher-summary";
import { SubmittedExamPapersList } from "@/components/exams/submitted-exam-papers-list";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { academicsService } from "@/services/academics.service";
import { formatDate } from "@/lib/utils";

export default function SubmittedExamPapersPage() {
  const [examConfigId, setExamConfigId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const queryKey = useMemo(
    () => ["school-exam-paper-submissions", examConfigId, sectionId, subjectName, teacherId],
    [examConfigId, sectionId, subjectName, teacherId],
  );

  const overview = useQuery({
    queryKey,
    queryFn: () =>
      academicsService.getExamPaperSubmissions({
        examConfigId: examConfigId || undefined,
        sectionId: sectionId || undefined,
        subjectName: subjectName || undefined,
        teacherId: teacherId || undefined,
      }),
  });

  const data = overview.data;
  const selectedExamId = examConfigId || data?.selectedExam?.id || "";
  const pendingCount = (data?.papers ?? []).filter((p) => p.reviewStatus === "PENDING_REVIEW").length;

  if (overview.isLoading && !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Exam papers" />
        <PageLoader variant="page" task="exams" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Exam papers"
        description="Approve teacher papers, set the exam date before printing, and track who still needs to submit."
      />

      <div className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="exam-filter">Exam</Label>
          <Select
            id="exam-filter"
            value={selectedExamId}
            onChange={(e) => {
              setExamConfigId(e.target.value);
              setSectionId("");
              setSubjectName("");
              setTeacherId("");
            }}
          >
            <option value="">All / upcoming</option>
            {(data?.exams ?? []).map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
                {exam.startDate ? ` · ${formatDate(exam.startDate)}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="class-filter">Class</Label>
          <Select id="class-filter" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All classes</option>
            {(data?.filters.sections ?? []).map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subject-filter">Subject</Label>
          <Select id="subject-filter" value={subjectName} onChange={(e) => setSubjectName(e.target.value)}>
            <option value="">All subjects</option>
            {(data?.filters.subjects ?? []).map((row) => (
              <option key={row.name} value={row.name}>{row.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="teacher-filter">Teacher</Label>
          <Select id="teacher-filter" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">All teachers</option>
            {(data?.filters.teachers ?? []).map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {data?.selectedExam ? (
        <div className="mb-6 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">{data.selectedExam.name}</p>
          <p className="mt-1 text-muted-foreground">
            {data.submitted} of {data.expected} papers submitted
            {pendingCount ? ` · ${pendingCount} waiting for approval` : ""}
            {data.selectedExam.examDate ? ` · Exam date ${formatDate(data.selectedExam.examDate)}` : " · Exam date not set yet"}
            {data.selectedExam.deadline
              ? ` · Paper due ${formatDate(data.selectedExam.deadline)}`
              : ""}
          </p>
        </div>
      ) : null}

      <section className="mb-8">
        {overview.isFetching && overview.isLoading ? (
          <PageLoader variant="panel" task="exams" />
        ) : (
          <SubmittedExamPapersList
            papers={data?.papers ?? []}
            isLoading={overview.isFetching && !overview.isLoading}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Teacher submission status
        </h2>
        {overview.isFetching && !overview.isLoading ? (
          <PageLoader variant="panel" task="exams" />
        ) : (
          <ExamPaperTeacherSummary teachers={data?.teachers ?? []} />
        )}
      </section>
    </div>
  );
}
