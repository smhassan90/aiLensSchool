"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AiWait } from "@/components/layout/ai-wait";
import { documentsService, type HomeworkPreview } from "@/services/documents.service";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { coerceLessonDisplayText } from "@/lib/lesson-display-text";
import { formatDate, localDateISO, localDateISOPlusDays } from "@/lib/utils";
import type { ClassSessionType, HomeworkSessionMode, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const SESSION_TYPES: { key: ClassSessionType; title: string; hint: string }[] = [
  { key: "NEW_LESSON", title: "New lesson", hint: "New material taught" },
  { key: "CONTINUATION", title: "Continue", hint: "Same chapter as before" },
  { key: "REVISION", title: "Revision", hint: "Review past chapters" },
];

function chapterLabel(ch: Lesson) {
  return ch.chapterName || ch.topicName || "Chapter";
}

function chapterSubtitle(ch: Lesson) {
  if (ch.chapterName && ch.topicName && ch.topicName !== ch.chapterName) {
    return ch.topicName;
  }
  return null;
}

function chapterContentPreview(ch: Lesson, maxLen = 140) {
  const raw = coerceLessonDisplayText(ch.extractedText ?? ch.aiSummary ?? "");
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "No preview text — open the chapter to check content.";
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen).trim()}…`;
}

function pageRangeLabel(ch: Lesson) {
  if (ch.pageFrom && ch.pageTo) return `Pages ${ch.pageFrom}–${ch.pageTo}`;
  if (ch.pageFrom) return `From page ${ch.pageFrom}`;
  return null;
}

function ChapterPickRow({
  ch,
  selected,
  onSelect,
  inputType,
  checked,
  onToggle,
}: {
  ch: Lesson;
  selected?: boolean;
  onSelect?: () => void;
  inputType?: "radio" | "checkbox";
  checked?: boolean;
  onToggle?: () => void;
}) {
  const subtitle = chapterSubtitle(ch);
  const pages = pageRangeLabel(ch);
  const progress =
    ch.chapterProgress === "COMPLETED"
      ? "Completed"
      : ch.chapterProgress === "IN_PROGRESS"
        ? "In progress"
        : null;

  const body = (
    <>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold leading-snug">{chapterLabel(ch)}</p>
          {progress && (
            <Badge variant={ch.chapterProgress === "COMPLETED" ? "secondary" : "warning"} className="text-[10px]">
              {progress}
            </Badge>
          )}
        </div>
        {subtitle && <p className="text-xs font-medium text-muted-foreground">{subtitle}</p>}
        <p className="text-xs leading-relaxed text-muted-foreground" dir={/[\u0600-\u06FF]/.test(ch.extractedText ?? "") ? "rtl" : undefined}>
          {chapterContentPreview(ch)}
        </p>
        <p className="text-[11px] text-muted-foreground/80">
          {[pages, ch.date ? `Added ${formatDate(ch.date)}` : null].filter(Boolean).join(" · ")}
        </p>
      </div>
    </>
  );

  if (inputType === "checkbox" && onToggle) {
    return (
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
          checked ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/25",
        )}
      >
        <input type="checkbox" className="mt-1" checked={checked} onChange={onToggle} />
        {body}
      </label>
    );
  }

  if (inputType === "radio" && onSelect) {
    return (
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
          selected ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/25",
        )}
      >
        <input type="radio" name="continuation" className="mt-1" checked={selected} onChange={onSelect} />
        {body}
      </label>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border hover:border-primary/30",
      )}
    >
      {body}
    </button>
  );
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
  const [homeworkInstruction, setHomeworkInstruction] = useState("");
  const [aiHomeworkDraft, setAiHomeworkDraft] = useState<HomeworkPreview | null>(null);

  useEffect(() => {
    if (homeworkMode !== "AI") {
      setAiHomeworkDraft(null);
    }
  }, [homeworkMode]);

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
        homeworkDueDate:
          homeworkMode === "NONE"
            ? undefined
            : homeworkMode === "AI" && aiHomeworkDraft
              ? aiHomeworkDraft.dueDate.slice(0, 10)
              : homeworkDueDate,
        homeworkInstruction:
          homeworkMode === "AI" && !aiHomeworkDraft ? homeworkInstruction.trim() || undefined : undefined,
        homeworkTitle: homeworkMode === "AI" && aiHomeworkDraft ? aiHomeworkDraft.title : undefined,
        homeworkDescription:
          homeworkMode === "AI" && aiHomeworkDraft ? aiHomeworkDraft.description : undefined,
        homeworkAnswerKey:
          homeworkMode === "AI" && aiHomeworkDraft ? aiHomeworkDraft.answerKey : undefined,
        homeworkQuestionsJson:
          homeworkMode === "AI" && aiHomeworkDraft ? aiHomeworkDraft.questionsJson : undefined,
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
      setAiHomeworkDraft(null);
      setHomeworkInstruction("");
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

  const generateAiHomework = useMutation({
    mutationFn: () => {
      if (!chapterSourceId) throw new Error("Select a chapter first");
      return documentsService.previewHomework({
        lessonId: chapterSourceId,
        dueDate: homeworkDueDate,
        instruction: homeworkInstruction.trim() || undefined,
      });
    },
    onSuccess: (draft) => {
      setAiHomeworkDraft(draft);
    },
    onError: (err) => {
      toast({
        title: "Could not generate homework",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const canPickAiHomework =
    homeworkMode === "AI" &&
    sessionType !== "REVISION" &&
    Boolean(chapterSourceId);

  const ignoreAiHomework = () => {
    setAiHomeworkDraft(null);
    setHomeworkMode("NONE");
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
            <CardDescription>
              Each card shows the chapter title and a short preview of the saved lecture text so you can pick the right one.
            </CardDescription>
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
              <div className="space-y-2">
                {readyChapters.map((ch) => (
                  <ChapterPickRow
                    key={ch.id}
                    ch={ch}
                    selected={chapterSourceId === ch.id}
                    onSelect={() => setChapterSourceId(ch.id)}
                  />
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
                <ChapterPickRow
                  key={ch.id}
                  ch={ch}
                  inputType="radio"
                  selected={chapterSourceId === ch.id}
                  onSelect={() => setChapterSourceId(ch.id)}
                />
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
              <ChapterPickRow
                key={ch.id}
                ch={ch}
                inputType="checkbox"
                checked={revisionIds.includes(ch.id)}
                onToggle={() => toggleRevision(ch.id)}
              />
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
              {generateAiHomework.isPending ? (
                <AiWait kind="homework" />
              ) : aiHomeworkDraft ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Edit the homework below, then save today&apos;s class or ignore this draft.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="ai-hw-title">Title</Label>
                    <Input
                      id="ai-hw-title"
                      value={aiHomeworkDraft.title}
                      onChange={(e) =>
                        setAiHomeworkDraft({ ...aiHomeworkDraft, title: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ai-hw-due">Due date</Label>
                    <Input
                      id="ai-hw-due"
                      type="date"
                      value={aiHomeworkDraft.dueDate.slice(0, 10)}
                      onChange={(e) =>
                        setAiHomeworkDraft({ ...aiHomeworkDraft, dueDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ai-hw-desc">Homework (for students)</Label>
                    <Textarea
                      id="ai-hw-desc"
                      rows={8}
                      value={aiHomeworkDraft.description}
                      onChange={(e) =>
                        setAiHomeworkDraft({ ...aiHomeworkDraft, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ai-hw-answers">Answer key (teachers only)</Label>
                    <Textarea
                      id="ai-hw-answers"
                      rows={5}
                      value={aiHomeworkDraft.answerKey ?? ""}
                      onChange={(e) =>
                        setAiHomeworkDraft({ ...aiHomeworkDraft, answerKey: e.target.value })
                      }
                    />
                  </div>
                </div>
              ) : (
                <>
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
                  {homeworkMode === "AI" && sessionType === "REVISION" && (
                    <p className="text-xs text-muted-foreground">
                      AI homework needs a single chapter — use new or continue, or choose my own words for revision.
                    </p>
                  )}
                  {homeworkMode === "AI" && sessionType !== "REVISION" && !chapterSourceId && (
                    <p className="text-xs text-muted-foreground">Select a chapter above before generating AI homework.</p>
                  )}
                  {homeworkMode === "AI" && canPickAiHomework && (
                    <div className="space-y-2">
                      <Label htmlFor="hw-instruction">How should homework be written? (optional)</Label>
                      <Textarea
                        id="hw-instruction"
                        rows={2}
                        value={homeworkInstruction}
                        onChange={(e) => setHomeworkInstruction(e.target.value)}
                        placeholder="e.g. easy words, keep it short"
                      />
                    </div>
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
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            {aiHomeworkDraft ? (
              <>
                <Button type="button" variant="outline" onClick={ignoreAiHomework}>
                  Ignore homework
                </Button>
                <Button
                  disabled={save.isPending || !selected || !aiHomeworkDraft.title.trim()}
                  onClick={() => {
                    if (!aiHomeworkDraft.description.trim()) {
                      toast({ title: "Homework text is empty", variant: "error" });
                      return;
                    }
                    save.mutate();
                  }}
                >
                  {save.isPending ? "Saving…" : "Save today's class"}
                </Button>
              </>
            ) : homeworkMode === "AI" && canPickAiHomework ? (
              <Button
                type="button"
                disabled={generateAiHomework.isPending || !selected}
                onClick={() => {
                  if (sessionType !== "REVISION" && !chapterSourceId) {
                    toast({ title: "Select a chapter", variant: "error" });
                    return;
                  }
                  generateAiHomework.mutate();
                }}
              >
                Generate AI homework
              </Button>
            ) : (
              <Button
                disabled={save.isPending || !selected || generateAiHomework.isPending}
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
                  if (homeworkMode === "AI") {
                    toast({ title: "Generate AI homework first", variant: "error" });
                    return;
                  }
                  save.mutate();
                }}
              >
                {save.isPending ? "Saving…" : "Save today's class"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
