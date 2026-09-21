"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ExamPaperTeacherSummary } from "@/components/exams/exam-paper-teacher-summary";
import { SubmittedExamPapersList } from "@/components/exams/submitted-exam-papers-list";
import { headTeachersService } from "@/services/head-teachers.service";
import { formatDate } from "@/lib/utils";

export default function HeadTeacherExamPapersPage() {
  const [examConfigId, setExamConfigId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const queryKey = useMemo(
    () => ["head-teacher-exam-papers", examConfigId, sectionId, subjectName, teacherId],
    [examConfigId, sectionId, subjectName, teacherId],
  );

  const overview = useQuery({
    queryKey,
    queryFn: () =>
      headTeachersService.getExamPaperSubmissions({
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
        description="Review on-time submissions and approve or reject papers from teachers in your classes."
        actions={
          <Link href="/teacher/head">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
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
          </p>
        </div>
      ) : null}

      {data?.teachers?.length ? (
        <div className="mb-6">
          <ExamPaperTeacherSummary teachers={data.teachers} />
        </div>
      ) : null}

      <SubmittedExamPapersList
        papers={data?.papers ?? []}
        isLoading={overview.isFetching}
        detailBasePath="/teacher/head/exam-papers"
        submissionsQueryKey="head-teacher-exam-papers"
      />
    </div>
  );
}
