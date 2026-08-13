"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { quizzesService } from "@/services/quizzes.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { FileQuestion } from "lucide-react";

export default function SchoolQuizzesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const quizzes = useQuery({ queryKey: ["quizzes"], queryFn: () => quizzesService.list({ limit: 50 }) });
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: () => academicsService.listSubjects({ limit: 100 }) });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const section = sections.data?.items.find((s) => s.id === sectionId);
  const year = years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];

  const generate = useMutation({
    mutationFn: () =>
      quizzesService.generate({
        academicYearId: year?.id ?? "",
        sectionId,
        subjectId,
        branchId: section?.branchId ?? "",
        lessonDateFrom: from,
        lessonDateTo: to,
        questionCount: 5,
      }),
    onSuccess: (quiz) => {
      toast({ title: "Quiz generated as draft", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      setOpen(false);
      router.push(`/school/quizzes/${quiz.id}`);
    },
    onError: (err) => toast({ title: "Generation failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-8">
      <PageHeader title="Quizzes" description="Generate from confirmed lessons. Drafts are never auto-published." actions={<Button onClick={() => setOpen(true)}>Generate quiz</Button>} />
      <div className="rounded-lg border bg-card">
        {!quizzes.data?.items.length ? (
          <EmptyState icon={<FileQuestion className="h-10 w-10" />} title="No quizzes" description="Generate from a date range of confirmed lessons." />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Subject</TableHead><TableHead>Section</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {quizzes.data.items.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{q.title}</TableCell>
                  <TableCell>{q.subject?.name ?? "—"}</TableCell>
                  <TableCell>{q.section?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant={q.status === "PUBLISHED" ? "success" : "secondary"}>{q.status}</Badge></TableCell>
                  <TableCell>{formatDate(q.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/school/quizzes/${q.id}`}>
                      <Button size="sm" variant="outline">Open</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader><DialogTitle>Generate quiz</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Section</Label>
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Select</option>
              {sections.data?.items.map((s) => <option key={s.id} value={s.id}>{s.grade?.name} {s.name}</option>)}
            </Select>
            <Label>Subject</Label>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Select</option>
              {subjects.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button disabled={generate.isPending || !sectionId || !subjectId} onClick={() => generate.mutate()}>Generate</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
