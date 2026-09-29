"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { localDateISO, localDateISOPlusDays } from "@/lib/utils";
import type { ClassSessionType, HomeworkSessionMode, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

const SESSION_TYPES: { key: ClassSessionType; title: string; hint: string }[] = [
  { key: "NEW_LESSON", title: "New lesson", hint: "New material taught" },
  { key: "CONTINUATION", title: "Continue", hint: "Same chapter as before" },
  { key: "REVISION", title: "Revision", hint: "Review past chapters" },
];

function chapterLabel(ch: Lesson) {
  return ch.chapterName || ch.topicName || "Chapter";
}

export function TodayInClassForm({
  initialClassKey,
  initialSessionType,
  initialChapterId,
}: {
  initialClassKey?: string;
  initialSessionType?: ClassSessionType;
  initialChapterId?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [classKey, setClassKey] = useState(initialClassKey ?? "");
  const [date, setDate] = useState(() => localDateISO());
  const [sessionType, setSessionType] = useState<ClassSessionType | null>(
    initialSessionType ?? null,
  );
  const [chapterSourceId, setChapterSourceId] = useState(initialChapterId ?? "");
  const [revisionIds, setRevisionIds] = useState<string[]>([]);
  const [parentSummary, setParentSummary] = useState("");
  const [homeworkMode, setHomeworkMode] = useState<HomeworkSessionMode>("NONE");
  const [homeworkText, setHomeworkText] = useState("");
  const [homeworkDueDate, setHomeworkDueDate] = useState(() => localDateISOPlusDays(1));

  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const selected = classes.data?.find((c) => `${c.sectionId}:${c.subjectId}` === classKey);

  const chapters = useQuery({
    queryKey: ["lesson-chapters", selected?.sectionId, selected?.subjectId],
    queryFn: () =>
      lessonsService.listChapters({
        sectionId: selected!.sectionId,
        subjectId: selected!.subjectId,
        limit: 50,
      }),
    enabled: Boolean(selected?.sectionId && selected?.subjectId),
  });

  const readyChapters = useMemo(
    () => (chapters.data ?? []).filter((c) => c.contentConfirmed),
    [chapters.data],
  );

  const inProgress = useMemo(
    () => readyChapters.filter((c) => c.chapterProgress !== "COMPLETED"),
    [readyChapters],
  );

  const save = useMutation({
    mutationFn: () => {
      if (!selected?.gradeId || !sessionType) throw new Error("Complete the form");
      const payload = {
        academicYearId: selected.academicYearId,
        gradeId: selected.gradeId,
        sectionId: selected.sectionId,
        subjectId: selected.subjectId,
        branchId: selected.branchId,
        date,
        sessionType,
        parentSummary: parentSummary.trim() || undefined,
        homeworkMode,
        homeworkText: homeworkMode === "PLAIN" ? homeworkText.trim() : undefined,
        homeworkDueDate: homeworkMode !== "NONE" ? homeworkDueDate : undefined,
        chapterSourceId:
          sessionType === "REVISION" ? undefined : chapterSourceId || undefined,
        revisionChapterIds: sessionType === "REVISION" ? revisionIds : undefined,
      };
      return lessonsService.createClassSession(payload);
    },
    onSuccess: () => {
      toast({ title: "Today's class saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher-lessons"] });
      queryClient.invalidateQueries({ queryKey: ["lesson-chapters"] });
      queryClient.invalidateQueries({ queryKey: ["homework"] });
      setSessionType(null);
      setChapterSourceId("");
      setRevisionIds([]);
      setParentSummary("");
      setHomeworkMode("NONE");
      setHomeworkText("");
    },
    onError: (err) => {
      toast({
        title: "Could not save",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const toggleRevision = (id: string) => {
    setRevisionIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Class</CardTitle>
          <CardDescription>Which class was this for?</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Class</Label>
            <Select value={classKey} onChange={(e) => setClassKey(e.target.value)}>
              <option value="">Select class</option>
              {classes.data?.map((cls) => (
                <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                  {cls.gradeName} {cls.sectionName} — {cls.subjectName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="class-date">Date</Label>
            <Input id="class-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label>What did you do in class today?</Label>
        <div className="grid gap-3 sm:grid-cols-3">
          {SESSION_TYPES.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={!classKey}
              onClick={() => {
                setSessionType(item.key);
                if (item.key === "CONTINUATION" && inProgress[0]) {
                  setChapterSourceId(inProgress[0].id);
                }
              }}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                sessionType === item.key
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-card hover:border-primary/30",
                !classKey && "opacity-50",
              )}
            >
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </button>
          ))}
        </div>
      </div>

      {sessionType === "NEW_LESSON" && (
        <Card>
          <CardHeader>
            <CardTitle>Chapter</CardTitle>
            <CardDescription>Pick saved chapter content for this new lesson.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!readyChapters.length ? (
              <p className="text-sm text-muted-foreground">
                No confirmed chapters yet.{" "}
                <Link href="/teacher/lessons/chapters/new" className="text-primary underline">
                  Add chapter content
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {readyChapters.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setChapterSourceId(ch.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      chapterSourceId === ch.id ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    {chapterLabel(ch)}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {sessionType === "CONTINUATION" && (
        <Card>
          <CardHeader>
            <CardTitle>Continue chapter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inProgress.length ? (
              inProgress.map((ch) => (
                <label key={ch.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3">
                  <input
                    type="radio"
                    name="continuation"
                    checked={chapterSourceId === ch.id}
                    onChange={() => setChapterSourceId(ch.id)}
                  />
                  <span className="text-sm font-medium">{chapterLabel(ch)}</span>
                  <span className="text-xs text-muted-foreground">In progress</span>
                </label>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No in-progress chapters. Log a new lesson first.</p>
            )}
          </CardContent>
        </Card>
      )}

      {sessionType === "REVISION" && (
        <Card>
          <CardHeader>
            <CardTitle>Chapters revised</CardTitle>
            <CardDescription>Select one or many.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {readyChapters.map((ch) => (
              <label key={ch.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3">
                <input
                  type="checkbox"
                  checked={revisionIds.includes(ch.id)}
                  onChange={() => toggleRevision(ch.id)}
                />
                <span className="text-sm">{chapterLabel(ch)}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {sessionType && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Note for parents</CardTitle>
              <CardDescription>Optional — shown in the diary.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={2}
                value={parentSummary}
                onChange={(e) => setParentSummary(e.target.value)}
                placeholder="e.g. Revised Ch.1–Ch.3 for mid-term"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Homework for today?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { mode: "AI" as const, label: "AI homework" },
                    { mode: "PLAIN" as const, label: "My own words" },
                    { mode: "NONE" as const, label: "No homework" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setHomeworkMode(opt.mode)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      homeworkMode === opt.mode ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {homeworkMode === "PLAIN" && (
                <Textarea
                  rows={4}
                  value={homeworkText}
                  onChange={(e) => setHomeworkText(e.target.value)}
                  placeholder="Do page 17. Do exercise till number 15."
                />
              )}
              {homeworkMode !== "NONE" && (
                <div className="space-y-2">
                  <Label>Due date</Label>
                  <Input
                    type="date"
                    value={homeworkDueDate}
                    onChange={(e) => setHomeworkDueDate(e.target.value)}
                  />
                </div>
              )}
              {homeworkMode === "AI" && sessionType === "REVISION" && (
                <p className="text-xs text-muted-foreground">
                  AI homework needs a single chapter — use new or continue, or choose my own words for revision.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              disabled={save.isPending || !selected}
              onClick={() => {
                if (sessionType !== "REVISION" && !chapterSourceId) {
                  toast({ title: "Select a chapter", variant: "error" });
                  return;
                }
                if (sessionType === "REVISION" && !revisionIds.length) {
                  toast({ title: "Select chapters to revise", variant: "error" });
                  return;
                }
                if (homeworkMode === "PLAIN" && !homeworkText.trim()) {
                  toast({ title: "Write homework or choose no homework", variant: "error" });
                  return;
                }
                if (homeworkMode === "AI" && sessionType === "REVISION") {
                  toast({ title: "Use my own words for revision homework", variant: "error" });
                  return;
                }
                save.mutate();
              }}
            >
              {save.isPending ? "Saving…" : "Save today's class"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
