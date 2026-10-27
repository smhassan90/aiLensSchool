"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { classroomRoundsService } from "@/services/classroom-rounds.service";
import { formatStatusLabel } from "@/lib/display-labels";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

export default function HeadTeacherRoundsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["classroom-rounds-now"],
    queryFn: () => classroomRoundsService.now(),
    refetchInterval: 60_000,
  });

  const [observing, setObserving] = useState<string | null>(null);
  const [match, setMatch] = useState("MATCHES_PLAN");
  const [notes, setNotes] = useState("");

  const observe = useMutation({
    mutationFn: (sectionId: string) => {
      const section = data!.sections.find((s) => s.section.id === sectionId);
      if (!section) throw new Error("Section missing");
      return classroomRoundsService.createObservation({
        clientRequestId: crypto.randomUUID(),
        sectionId,
        date: data!.date,
        periodNumber: section.period?.periodNumber,
        subjectId: undefined,
        match,
        notes,
        followUpRequired: false,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["classroom-rounds-now"] });
      setObserving(null);
      setNotes("");
      toast({ title: "Observation recorded", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Could not record", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-4">
      <PageHeader
        title="Classroom rounds"
        description="Compare scheduled lessons with what you observe. Teacher reports and head-teacher observations are kept separate."
      />
      {isLoading && <PageLoader />}
      {isError && <p className="text-destructive text-sm">Could not load rounds.</p>}
      {data && (
        <p className="text-xs text-muted-foreground">
          {data.date} · {formatStatusLabel(data.timezone)}
        </p>
      )}
      {data?.sections.map((row) => (
        <Card key={row.section.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{row.section.label}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {formatStatusLabel(row.state)} · {formatStatusLabel(row.displayStatus)}
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {row.period && (
              <p>
                P{row.period.periodNumber} {row.period.subject}
                {row.period.startTime ? ` (${row.period.startTime}–${row.period.endTime})` : ""}
              </p>
            )}
            {row.plannedLesson ? (
              <p className="font-medium">{row.plannedLesson.title}</p>
            ) : (
              <p className="text-muted-foreground">No planned lesson for this period.</p>
            )}
            {row.record && <p>Teacher report: {formatStatusLabel(row.record.status)}</p>}
            {row.lastObservation && (
              <p className="text-muted-foreground">
                Last observation: {formatStatusLabel(row.lastObservation.match)}
              </p>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setObserving(row.section.id)}>
              Record observation
            </Button>
          </CardContent>
        </Card>
      ))}

      {observing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-4 space-y-3">
            <h3 className="font-semibold">Classroom observation</h3>
            <Select value={match} onChange={(e) => setMatch(e.target.value)}>
              <option value="MATCHES_PLAN">Matches plan</option>
              <option value="PARTIAL_MATCH">Partial match</option>
              <option value="DIFFERENT_LESSON">Different lesson</option>
              <option value="NO_LESSON_OBSERVED">No lesson observed</option>
              <option value="UNKNOWN">Other</option>
            </Select>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={3} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setObserving(null)}>Cancel</Button>
              <Button type="button" disabled={observe.isPending} onClick={() => observe.mutate(observing)}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
