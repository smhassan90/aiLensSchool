"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { documentsService } from "@/services/documents.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { NotebookPen } from "lucide-react";

export default function DiaryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const diaries = useQuery({
    queryKey: ["diaries", sectionId],
    queryFn: () => documentsService.listDiaries({ sectionId: sectionId || undefined, limit: 30 }),
  });
  const selected = sections.data?.items.find((s) => s.id === sectionId);
  const year = years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];

  const generate = useMutation({
    mutationFn: () =>
      documentsService.generateDiary({
        academicYearId: year?.id ?? "",
        sectionId,
        branchId: selected?.branchId ?? "",
        date,
      }),
    onSuccess: () => {
      toast({ title: "Diary generated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["diaries"] });
    },
    onError: (err) => toast({ title: "Could not generate diary", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Home diary" description="Generate the daily class note from confirmed lessons and homework" />
      <div className="mb-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label>Section</Label>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All</option>
            {sections.data?.items.map((s) => <option key={s.id} value={s.id}>{s.grade?.name} {s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button disabled={!sectionId || generate.isPending} onClick={() => generate.mutate()}>Generate from lessons</Button>
        </div>
      </div>
      {diaries.isLoading ? (
        <PageLoader variant="panel" />
      ) : !diaries.data?.items.length ? (
        <EmptyState icon={<NotebookPen className="h-10 w-10" />} title="No diaries yet" description="Select a section and generate from today’s lessons." />
      ) : (
        <div className="space-y-4">
          {diaries.data.items.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle>{d.section?.grade?.name} {d.section?.name} · {formatDate(d.date)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 whitespace-pre-wrap text-sm">
                <p><span className="font-medium">Lessons:</span> {d.lessonSummary}</p>
                <p><span className="font-medium">Homework:</span> {d.homeworkNotes}</p>
                {d.teacherRemarks && <p><span className="font-medium">Remarks:</span> {d.teacherRemarks}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
