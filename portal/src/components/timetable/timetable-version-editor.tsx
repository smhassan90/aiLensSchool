"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  timetablesService,
  type PeriodInput,
  type TimetablePeriodRow,
  type TimetableVersionDetail,
  type TimetableWeekday,
} from "@/services/timetables.service";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { TimetableValidationList } from "@/components/timetable/timetable-validation-list";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

const WEEKDAYS: TimetableWeekday[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const DAY_LABEL: Record<TimetableWeekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

function periodToInput(p: TimetablePeriodRow): PeriodInput {
  return {
    weekday: p.weekday,
    periodNumber: p.periodNumber,
    kind: p.kind,
    startTime: p.startTime,
    endTime: p.endTime,
    label: p.label,
    subjectId: p.subjectId,
    teacherId: p.teacherId,
    room: p.room,
  };
}

type TimetableVersionEditorProps = {
  versionId: string;
  initial: TimetableVersionDetail;
  canEdit: boolean;
  onPublished?: () => void;
};

export function TimetableVersionEditor({
  versionId,
  initial,
  canEdit,
  onPublished,
}: TimetableVersionEditorProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mobileDay, setMobileDay] = useState<TimetableWeekday>("MONDAY");
  const [periods, setPeriods] = useState<PeriodInput[]>(() =>
    initial.version.periods.map(periodToInput),
  );
  const [revision, setRevision] = useState(initial.version.revision);
  const [validation, setValidation] = useState(initial.validation);
  const [effectiveFrom, setEffectiveFrom] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [publishOpen, setPublishOpen] = useState(false);

  const subjects = useQuery({
    queryKey: ["subjects", "all"],
    queryFn: () => academicsService.listSubjects({ limit: 200 }),
  });
  const teachers = useQuery({
    queryKey: ["teachers", "all"],
    queryFn: () => teachersService.list({ limit: 200 }),
  });

  const save = useMutation({
    mutationFn: () =>
      timetablesService.updateVersion(versionId, {
        expectedRevision: revision,
        periods,
      }),
    onSuccess: (data) => {
      setRevision(data.version.revision);
      setValidation(data.validation);
      setPeriods(data.version.periods.map(periodToInput));
      queryClient.setQueryData(["timetable-version", versionId], data);
      toast({ title: "Draft saved", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Save failed", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const revalidate = useMutation({
    mutationFn: () => timetablesService.validateVersion(versionId),
    onSuccess: (data) => {
      setValidation(data.issues);
      toast({ title: "Validation updated", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Validation failed", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      let rev = revision;
      if (canEdit) {
        const saved = await timetablesService.updateVersion(versionId, {
          expectedRevision: revision,
          periods,
        });
        rev = saved.version.revision;
        setRevision(rev);
        setValidation(saved.validation);
        setPeriods(saved.version.periods.map(periodToInput));
      }
      return timetablesService.publish({
        effectiveFrom,
        items: [{ versionId, expectedRevision: rev }],
      });
    },
    onSuccess: () => {
      setPublishOpen(false);
      toast({ title: "Timetable published", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["timetable-versions"] });
      onPublished?.();
    },
    onError: (err) => {
      toast({ title: "Publish failed", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const updatePeriod = (index: number, patch: Partial<PeriodInput>) => {
    setPeriods((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const addPeriod = (weekday: TimetableWeekday) => {
    const dayPeriods = periods.filter((p) => p.weekday === weekday);
    const nextNum = (dayPeriods.reduce((m, p) => Math.max(m, p.periodNumber ?? 0), 0) || 0) + 1;
    setPeriods((prev) => [
      ...prev,
      {
        weekday,
        periodNumber: nextNum,
        kind: "LESSON",
        startTime: "08:00",
        endTime: "08:40",
        label: "Lesson",
        subjectId: null,
        teacherId: null,
        room: null,
      },
    ]);
  };

  const removePeriod = (index: number) => {
    setPeriods((prev) => prev.filter((_, i) => i !== index));
  };

  const blockingCount = validation.filter((i) => i.severity === "BLOCKING").length;
  const isDraft = initial.version.status === "DRAFT";

  const renderDay = (weekday: TimetableWeekday) => {
    const dayRows = periods
      .map((p, globalIndex) => ({ p, globalIndex }))
      .filter(({ p }) => p.weekday === weekday);

    return (
      <div key={weekday} className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{DAY_LABEL[weekday]}</h3>
          {canEdit && isDraft && (
            <Button type="button" size="sm" variant="outline" onClick={() => addPeriod(weekday)}>
              Add period
            </Button>
          )}
        </div>
        {dayRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No periods.</p>
        ) : (
          <div className="space-y-3">
            {dayRows.map(({ p, globalIndex }) => (
              <div key={globalIndex} className="rounded-md border p-3 text-sm space-y-2">
                <div className="grid gap-2 sm:grid-cols-4">
                  <div>
                    <Label className="text-xs">Period #</Label>
                    <Input
                      type="number"
                      min={0}
                      disabled={!canEdit || !isDraft}
                      value={p.periodNumber ?? ""}
                      onChange={(e) =>
                        updatePeriod(globalIndex, {
                          periodNumber: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Start</Label>
                    <Input
                      disabled={!canEdit || !isDraft}
                      placeholder="08:00"
                      value={p.startTime ?? ""}
                      onChange={(e) => updatePeriod(globalIndex, { startTime: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">End</Label>
                    <Input
                      disabled={!canEdit || !isDraft}
                      placeholder="08:40"
                      value={p.endTime ?? ""}
                      onChange={(e) => updatePeriod(globalIndex, { endTime: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Kind</Label>
                    <Select
                      disabled={!canEdit || !isDraft}
                      value={p.kind}
                      onChange={(e) => updatePeriod(globalIndex, { kind: e.target.value as PeriodInput["kind"] })}
                    >
                      <option value="LESSON">Lesson</option>
                      <option value="BREAK">Break</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input
                    disabled={!canEdit || !isDraft}
                    value={p.label}
                    onChange={(e) => updatePeriod(globalIndex, { label: e.target.value })}
                  />
                </div>
                {p.kind === "LESSON" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Subject</Label>
                      <Select
                        disabled={!canEdit || !isDraft}
                        value={p.subjectId ?? ""}
                        onChange={(e) =>
                          updatePeriod(globalIndex, { subjectId: e.target.value || null })
                        }
                      >
                        <option value="">—</option>
                        {(subjects.data?.items ?? []).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Teacher</Label>
                      <Select
                        disabled={!canEdit || !isDraft}
                        value={p.teacherId ?? ""}
                        onChange={(e) =>
                          updatePeriod(globalIndex, { teacherId: e.target.value || null })
                        }
                      >
                        <option value="">—</option>
                        {(teachers.data?.items ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.user?.firstName} {t.user?.lastName}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}
                {canEdit && isDraft && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removePeriod(globalIndex)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {canEdit && isDraft && (
          <>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" variant="outline" disabled={revalidate.isPending} onClick={() => revalidate.mutate()}>
              {revalidate.isPending ? "Validating…" : "Revalidate"}
            </Button>
            <Button
              type="button"
              disabled={blockingCount > 0 || publish.isPending}
              onClick={() => setPublishOpen(true)}
            >
              Publish
            </Button>
          </>
        )}
        {!isDraft && (
          <p className="text-sm text-muted-foreground">
            Published versions are read-only. Create a new draft to change this section&apos;s timetable.
          </p>
        )}
      </div>

      <TimetableValidationList issues={validation} />

      <div className="hidden gap-6 lg:grid lg:grid-cols-5">{WEEKDAYS.map((d) => renderDay(d))}</div>

      <div className="space-y-3 lg:hidden">
        <Select value={mobileDay} onChange={(e) => setMobileDay(e.target.value as TimetableWeekday)}>
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>{DAY_LABEL[d]}</option>
          ))}
        </Select>
        {renderDay(mobileDay)}
      </div>

      {publishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg space-y-4">
            <h3 className="font-semibold">Publish timetable</h3>
            <p className="text-sm text-muted-foreground">
              This will make the schedule active for{" "}
              {initial.version.section.grade.name} {initial.version.section.name} from the effective date.
            </p>
            <div className="space-y-2">
              <Label htmlFor="effective-from">Effective from</Label>
              <Input
                id="effective-from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            {blockingCount > 0 && (
              <p className="text-sm text-destructive">Fix blocking errors before publishing.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button>
              <Button
                type="button"
                disabled={blockingCount > 0 || publish.isPending}
                onClick={() => publish.mutate()}
              >
                {publish.isPending ? "Publishing…" : "Confirm publish"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
