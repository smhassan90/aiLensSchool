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
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

export default function SchoolExamPapersPage() {
  const papers = useQuery({
    queryKey: ["school-exam-papers"],
    queryFn: () => quizzesService.list({ limit: 100, paperKind: "EXAM" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Exam printouts"
        description="Papers teachers generated from their lectures. Open a submitted paper to print it for the class."
      />
      <div className="rounded-lg border bg-card">
        {papers.isLoading ? (
          <PageLoader variant="panel" task="exams" />
        ) : !papers.data?.items.length ? (
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
                <TableHead>Class</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {papers.data.items.map((paper) => (
                <TableRow key={paper.id}>
                  <TableCell className="font-medium">
                    {paper.title}
                    <p className="text-xs text-muted-foreground">{examPaperLabel(paper.paperKind)}</p>
                  </TableCell>
                  <TableCell>
                    {paper.subject?.name ?? "—"} {paper.section?.name ?? ""}
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
