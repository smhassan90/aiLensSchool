"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { ReportCardSheet } from "@/components/report-cards/report-card-sheet";
import { documentsService } from "@/services/documents.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { CreditCard } from "lucide-react";

export default function ReportCardsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [term, setTerm] = useState("");
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const year = years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];
  const examConfigs = useQuery({
    queryKey: ["exam-configs", year?.id],
    queryFn: () => academicsService.listExamConfigs(year?.id),
    enabled: Boolean(year?.id),
  });
  const cards = useQuery({
    queryKey: ["report-cards", sectionId, year?.id],
    queryFn: () => documentsService.listReportCards({ sectionId: sectionId || undefined, academicYearId: year?.id, limit: 50 }),
    enabled: Boolean(year?.id),
  });

  const generate = useMutation({
    mutationFn: () =>
      documentsService.generateReportCards({
        academicYearId: year?.id ?? "",
        sectionId: sectionId || undefined,
        termLabel: term || examConfigs.data?.[0]?.name || "Term 1",
      }),
    onSuccess: (res) => {
      toast({ title: `Generated ${res.generated} report cards`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["report-cards"] });
    },
    onError: (err) => toast({ title: "Generation failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="Report cards"
          description="Print the school’s progress report: exam marks, grade, rank and signatures"
          actions={<Button onClick={() => window.print()}>Print</Button>}
        />
      </div>
      <div className="mb-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div>
          <Label>Section</Label>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All classes</option>
            {sections.data?.items.map((s) => <option key={s.id} value={s.id}>{s.grade?.name} {s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Paper / term</Label>
          <Select value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="">Choose paper</option>
            {(examConfigs.data ?? []).map((exam) => (
              <option key={exam.id} value={exam.name}>{exam.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button disabled={generate.isPending || !year} onClick={() => generate.mutate()}>Generate</Button>
        </div>
      </div>
      {cards.isLoading ? (
        <PageLoader variant="panel" />
      ) : !cards.data?.items.length ? (
        <EmptyState icon={<CreditCard className="h-10 w-10" />} title="No report cards" description="Generate after exam marks are entered." />
      ) : (
        <div className="space-y-8 print:space-y-0">
          {cards.data.items.map((card) => (
            <ReportCardSheet key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
