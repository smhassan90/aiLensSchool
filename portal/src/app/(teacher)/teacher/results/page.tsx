"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { resultsService } from "@/services/results.service";
import { formatDate } from "@/lib/utils";
import { Trophy } from "lucide-react";

export default function TeacherResultsPage() {
  const [search, setSearch] = useState("");
  const results = useQuery({ queryKey: ["results"], queryFn: () => resultsService.list({ limit: 100 }) });
  const items = (results.data?.items ?? []).filter((row) => {
    const name = `${row.student?.firstName ?? ""} ${row.student?.lastName ?? ""} ${row.quiz?.title ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Results" description="Quiz scores for your classes" />
      <div className="mb-4 max-w-md">
        <Input placeholder="Search student or quiz" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="rounded-lg border bg-card">
        {results.isLoading ? (
          <PageLoader variant="panel" />
        ) : !items.length ? (
          <EmptyState icon={<Trophy className="h-10 w-10" />} title="No results" description="Published quizzes will appear here after attempts." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Quiz</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.student ? `${row.student.firstName} ${row.student.lastName}` : "—"}</TableCell>
                  <TableCell>{row.quiz?.title ?? "—"}</TableCell>
                  <TableCell><Badge>{Number(row.percentage)}%</Badge></TableCell>
                  <TableCell>{formatDate(row.submittedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
