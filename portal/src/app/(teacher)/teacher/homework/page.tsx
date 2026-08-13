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
import { homeworkService } from "@/services/homework.service";
import { documentsService } from "@/services/documents.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { ClipboardList } from "lucide-react";

export default function TeacherHomeworkPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [classKey, setClassKey] = useState("");
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const homework = useQuery({ queryKey: ["homework"], queryFn: () => homeworkService.list({ limit: 50 }) });
  const classes = useQuery({ queryKey: ["teacher-classes"], queryFn: () => teachersService.myClasses() });
  const selected = classes.data?.find((c) => `${c.sectionId}:${c.subjectId}` === classKey);

  const generate = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a class");
      return documentsService.generateHomework({
        academicYearId: selected.academicYearId,
        sectionId: selected.sectionId,
        subjectId: selected.subjectId,
        branchId: selected.branchId,
        dueDate,
      });
    },
    onSuccess: () => {
      toast({ title: "Homework generated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["homework"] });
      setOpen(false);
    },
    onError: (err) => toast({ title: "Generation failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-8">
      <PageHeader title="Homework" description="Generate practice from your latest confirmed lesson" actions={<Button onClick={() => setOpen(true)}>Generate homework</Button>} />
      <div className="rounded-lg border bg-card">
        {!homework.data?.items.length ? (
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
          <DialogHeader><DialogTitle>Generate homework</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Class</Label>
            <Select value={classKey} onChange={(e) => setClassKey(e.target.value)}>
              <option value="">Select</option>
              {classes.data?.map((cls) => (
                <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                  {cls.gradeName} {cls.sectionName} — {cls.subjectName}
                </option>
              ))}
            </Select>
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Button disabled={generate.isPending || !classKey} onClick={() => generate.mutate()}>Generate</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
