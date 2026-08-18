"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { homeworkService } from "@/services/homework.service";
import { documentsService } from "@/services/documents.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { ClipboardList } from "lucide-react";

export default function SchoolHomeworkPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const homework = useQuery({ queryKey: ["homework"], queryFn: () => homeworkService.list({ limit: 50 }) });
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: () => academicsService.listSubjects({ limit: 100 }) });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const section = sections.data?.items.find((s) => s.id === sectionId);
  const year = years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];

  const generate = useMutation({
    mutationFn: () =>
      documentsService.generateHomework({
        academicYearId: year?.id ?? "",
        sectionId,
        subjectId,
        branchId: section?.branchId ?? "",
        title: title.trim(),
        dueDate,
      }),
    onSuccess: () => {
      toast({ title: "Homework generated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["homework"] });
      setOpen(false);
      setTitle("");
    },
    onError: (err) => toast({ title: "Generation failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Homework" description="Give each assignment a topic title so teachers can select it when generating a quiz" actions={<Button onClick={() => setOpen(true)}>Give homework</Button>} />
      <div className="rounded-lg border bg-card">
        {homework.isLoading ? (
          <PageLoader variant="panel" />
        ) : !homework.data?.items.length ? (
          <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="No homework" description="Generate from a lesson summary." />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Subject</TableHead><TableHead>Section</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
            <TableBody>
              {homework.data.items.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.title}</TableCell>
                  <TableCell>{h.subject?.name ?? "—"}</TableCell>
                  <TableCell>{h.section?.name ?? "—"}</TableCell>
                  <TableCell>{formatDate(h.dueDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader><DialogTitle>Give homework</DialogTitle></DialogHeader>
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
            <Label htmlFor="homework-title">Topic title</Label>
            <Input
              id="homework-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Photosynthesis — energy from sunlight"
            />
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Button disabled={generate.isPending || !sectionId || !subjectId || !title.trim()} onClick={() => generate.mutate()}>
              {generate.isPending ? "Saving…" : "Give homework"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
