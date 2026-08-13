"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { lessonsService } from "@/services/lessons.service";
import { formatDate } from "@/lib/utils";
import { BookOpen } from "lucide-react";

export default function LessonsPage() {
  const lessons = useQuery({ queryKey: ["lessons"], queryFn: () => lessonsService.list({ limit: 50 }) });
  return (
    <div className="p-8">
      <PageHeader title="Lessons" description="Confirmed and in-progress classroom lessons" />
      <div className="rounded-lg border bg-card">
        {!lessons.data?.items.length ? (
          <EmptyState icon={<BookOpen className="h-10 w-10" />} title="No lessons" description="Teachers record lessons from the teacher hub." />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Class</TableHead><TableHead>Subject</TableHead><TableHead>Topic</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {lessons.data.items.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{formatDate(l.date)}</TableCell>
                  <TableCell>{l.grade?.name} {l.section?.name}</TableCell>
                  <TableCell>{l.subject?.name}</TableCell>
                  <TableCell>{l.topicName ?? l.chapterName ?? "—"}</TableCell>
                  <TableCell><Badge variant={l.status === "CONFIRMED" ? "success" : "secondary"}>{l.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
