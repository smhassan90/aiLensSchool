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
import { BarChart } from "@/components/charts/simple-charts";
import { CreditCard } from "lucide-react";

export default function ReportCardsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [term, setTerm] = useState("Term 1");
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const year = years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];
  const cards = useQuery({
    queryKey: ["report-cards", sectionId],
    queryFn: () => documentsService.listReportCards({ sectionId: sectionId || undefined, academicYearId: year?.id, limit: 50 }),
    enabled: Boolean(year?.id),
  });

  const generate = useMutation({
    mutationFn: () =>
      documentsService.generateReportCards({
        academicYearId: year?.id ?? "",
        sectionId: sectionId || undefined,
        termLabel: term,
      }),
    onSuccess: (res) => {
      toast({ title: `Generated ${res.generated} report cards`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["report-cards"] });
    },
    onError: (err) => toast({ title: "Generation failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 print:p-0">
      <PageHeader
        title="Report cards"
        description="Compile quiz averages and attendance into a printable report"
        actions={<Button className="print:hidden" onClick={() => window.print()}>Print</Button>}
      />
      <div className="mb-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div>
          <Label>Section</Label>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All classes</option>
            {sections.data?.items.map((s) => <option key={s.id} value={s.id}>{s.grade?.name} {s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Term</Label>
          <Input value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button disabled={generate.isPending || !year} onClick={() => generate.mutate()}>Generate</Button>
        </div>
      </div>
      {cards.isLoading ? (
        <PageLoader variant="panel" />
      ) : !cards.data?.items.length ? (
        <EmptyState icon={<CreditCard className="h-10 w-10" />} title="No report cards" description="Generate from quiz results and attendance." />
      ) : (
        <div className="space-y-6">
          {cards.data.items.map((card) => (
            <Card key={card.id} className="break-inside-avoid">
              <CardHeader>
                <CardTitle>
                  {card.student?.firstName} {card.student?.lastName} · {card.grade?.name} {card.section?.name} · {card.termLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm">Overall {Number(card.overallPercentage)}% · Attendance {Number(card.attendanceRate)}%</p>
                {card.remarks && <p className="mb-3 text-sm">{card.remarks}</p>}
                <BarChart items={(card.lines ?? []).map((line) => ({ label: `${line.subject.name} (${line.gradeLetter})`, value: Number(line.average) }))} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
