"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { quizzesService } from "@/services/quizzes.service";
import { examPaperLabel, examStatusLabel } from "@/lib/exam-paper";
import { difficultyColorClass, difficultyDescription, difficultyLabel } from "@/lib/difficulty";
import { personFullName } from "@/lib/person-name";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

export default function SchoolExamPapersPage() {
  const papers = useQuery({
    queryKey: ["school-exam-papers"],
    queryFn: () => quizzesService.list({ limit: 100, paperKind: "EXAM" }),
  });

  const items = papers.data?.items ?? [];
  const submitted = items.filter((paper) => paper.status === "CLOSED");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Exam printouts"
        description="Papers teachers generated from their lectures. Open a submitted paper to print it for the class."
      />
      <p className="mb-4 text-sm text-muted-foreground">
        {submitted.length} of {items.length} papers submitted for printout.
      </p>
      <div className="rounded-lg border bg-card">
        {papers.isLoading ? (
          <PageLoader variant="panel" task="exams" />
        ) : !items.length ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="No exam papers yet"
            description="When a teacher generates an assessment, mid term, or final and submits it, it appears here for printout."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paper</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((paper) => (
                <TableRow key={paper.id}>
                  <TableCell className="font-medium">
                    {paper.title}
                    <p className="text-xs text-muted-foreground">
                      {paper.examConfig?.name ?? examPaperLabel(paper.paperKind)}
                    </p>
                  </TableCell>
                  <TableCell>
                    {paper.createdBy
                      ? personFullName(paper.createdBy.firstName, paper.createdBy.lastName)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {paper.subject?.name ?? "—"} {paper.section?.name ?? ""}
                  </TableCell>
                  <TableCell>
                    {paper.difficulty ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColorClass(paper.difficulty)}`}
                        title={difficultyDescription(paper.difficulty)}
                      >
                        {difficultyLabel(paper.difficulty)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={paper.status === "CLOSED" ? "success" : "warning"}>
                      {examStatusLabel(paper.status, paper.paperKind)}
                    </Badge>
                  </TableCell>
                  <TableCell>{paper.submittedAt ? formatDate(paper.submittedAt) : "—"}</TableCell>
                  <TableCell>
                    <Link href={`/school/exam-papers/${paper.id}`}>
                      <Button size="sm" variant="outline">
                        {paper.status === "CLOSED" ? "Print" : "Review"}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
