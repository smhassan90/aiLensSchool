"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { documentsService } from "@/services/documents.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { IdCard } from "lucide-react";

export default function IdCardsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const cards = useQuery({
    queryKey: ["id-cards", search],
    queryFn: () => documentsService.listIdCards({ search: search || undefined, limit: 100 }),
  });

  const generate = useMutation({
    mutationFn: () => documentsService.generateIdCards({ sectionId: sectionId || undefined }),
    onSuccess: (res) => {
      toast({ title: `Generated ${res.generated} ID cards`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["id-cards"] });
    },
    onError: (err) => toast({ title: "Generation failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-8 print:p-4">
      <PageHeader
        title="ID cards"
        description="Generate printable student identity cards"
        actions={<Button className="print:hidden" onClick={() => window.print()}>Print</Button>}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-4 print:hidden">
        <div>
          <Label>Section</Label>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All students</option>
            {sections.data?.items.map((s) => <option key={s.id} value={s.id}>{s.grade?.name} {s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or card number" />
        </div>
        <div className="flex items-end">
          <Button disabled={generate.isPending} onClick={() => generate.mutate()}>Generate</Button>
        </div>
      </div>
      {!cards.data?.items.length ? (
        <EmptyState icon={<IdCard className="h-10 w-10" />} title="No ID cards" description="Generate cards for a section or the whole school." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.data.items.map((card) => {
            const enrollment = card.student?.enrollments?.[0];
            return (
              <div key={card.id} className="break-inside-avoid rounded-xl border-2 border-primary/30 bg-card p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-primary">{card.school?.name ?? "School"}</p>
                <p className="mt-2 font-display text-lg font-semibold">
                  {card.student ? `${card.student.firstName} ${card.student.lastName}` : card.teacher?.user.firstName}
                </p>
                <p className="text-sm text-muted-foreground">{card.cardNumber}</p>
                <p className="mt-3 text-sm">{enrollment?.grade?.name} {enrollment?.section?.name}</p>
                <p className="text-xs text-muted-foreground">{card.branch?.name}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
