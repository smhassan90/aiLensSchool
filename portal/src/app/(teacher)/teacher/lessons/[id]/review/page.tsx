"use client";

import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonsService } from "@/services/lessons.service";
import { documentsService, type HomeDiaryPreview, type HomeworkPreview } from "@/services/documents.service";
import { homeworkService } from "@/services/homework.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  NotebookPen,
  RefreshCw,
  Sparkles,
} from "lucide-react";

const KEY_POINT_HINTS = ["Easy words, keep it short", "Harder words, make it longer"];
const HOMEWORK_HINTS = ["Easy words and keep it short", "Use harder words and make it longer"];
const DIARY_HINTS = ["Easy words, keep it short", "More detail for parents"];

function lessonDate(value?: string) {
  return value ? value.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function StyleChips({
  hints,
  disabled,
  onPick,
}: {
  hints: string[];
  disabled?: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {hints.map((hint) => (
        <button
          key={hint}
          type="button"
          disabled={disabled}
          onClick={() => onPick(hint)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
        >
          {hint}
        </button>
      ))}
    </div>
  );
}

export default function ReviewLessonPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const styleHydrated = useRef(false);

  const [chapterName, setChapterName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [conceptsText, setConceptsText] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");
  const [keyPointInstruction, setKeyPointInstruction] = useState("");
  const [homeworkInstruction, setHomeworkInstruction] = useState("");
  const [diaryInstruction, setDiaryInstruction] = useState("");
  const [homeworkDraft, setHomeworkDraft] = useState<HomeworkPreview | null>(null);
  const [diaryDraft, setDiaryDraft] = useState<HomeDiaryPreview | null>(null);
  const [homeworkSaved, setHomeworkSaved] = useState(false);
  const [diarySaved, setDiarySaved] = useState(false);

  const { data: lesson, isLoading, isError, error } = useQuery({
    queryKey: ["lesson", params.id],
    queryFn: () => lessonsService.getById(params.id),
    enabled: !!params.id,
  });

  useEffect(() => {
    if (!lesson) return;
    setChapterName(lesson.chapterName ?? "");
    setTopicName(lesson.topicName ?? "");
    setExtractedText(lesson.extractedText ?? "");
    setConceptsText((lesson.concepts ?? []).map((item) => item.name).join("\n"));
    setTeacherNotes(lesson.teacherNotes ?? "");
    setPageFrom(lesson.pageFrom ? String(lesson.pageFrom) : "");
    setPageTo(lesson.pageTo ? String(lesson.pageTo) : "");
    if (!styleHydrated.current) {
      setKeyPointInstruction(lesson.gradeStyle?.keyPointStyle ?? "");
      setHomeworkInstruction(lesson.gradeStyle?.homeworkStyle ?? "");
      setDiaryInstruction(lesson.gradeStyle?.diaryStyle ?? "");
      styleHydrated.current = true;
    }
  }, [lesson]);

  const confirmed = lesson?.status === "CONFIRMED";
  const gradeLabel = lesson?.grade?.name ? `Grade ${lesson.grade.name}` : "this grade";

  const editPayload = () => ({
    chapterName: chapterName.trim() || undefined,
    topicName: topicName.trim() || undefined,
    extractedText,
    teacherNotes: teacherNotes.trim() || undefined,
    pageFrom: pageFrom && Number.isFinite(Number(pageFrom)) ? Number(pageFrom) : undefined,
    pageTo: pageTo && Number.isFinite(Number(pageTo)) ? Number(pageTo) : undefined,
    concepts: conceptsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  });

  const saveMutation = useMutation({
    mutationFn: () => lessonsService.update(params.id, editPayload()),
    onSuccess: (updated) => {
      queryClient.setQueryData(["lesson", params.id], updated);
      toast({ title: "Extracted content saved", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not save lesson",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!confirmed) {
        await lessonsService.update(params.id, editPayload());
      }
      return lessonsService.confirm(params.id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["lesson", params.id], updated);
      queryClient.invalidateQueries({ queryKey: ["teacher-lessons"] });
      toast({ title: "Lesson confirmed", description: "Today’s lesson is now finalized.", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Confirmation failed",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const regenerateKeyPoints = useMutation({
    mutationFn: async () => {
      if (!confirmed) {
        await lessonsService.update(params.id, editPayload());
      }
      return lessonsService.regenerateKeyPoints(params.id, keyPointInstruction.trim() || undefined);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["lesson", params.id], updated);
      setConceptsText((updated.concepts ?? []).map((item) => item.name).join("\n"));
      toast({ title: "Key points updated", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not regenerate key points",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const previewHomework = useMutation({
    mutationFn: async () => {
      if (!confirmed) {
        await lessonsService.update(params.id, editPayload());
      }
      return documentsService.previewHomework({
        lessonId: params.id,
        dueDate: homeworkDraft?.dueDate,
        instruction: homeworkInstruction.trim() || undefined,
      });
    },
    onSuccess: (draft) => {
      setHomeworkDraft(draft);
      setHomeworkSaved(false);
    },
    onError: (err) => {
      toast({
        title: "Could not generate homework",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const saveHomework = useMutation({
    mutationFn: () => {
      if (!homeworkDraft) throw new Error("No homework to save");
      return homeworkService.create({
        academicYearId: homeworkDraft.academicYearId,
        sectionId: homeworkDraft.sectionId,
        subjectId: homeworkDraft.subjectId,
        branchId: homeworkDraft.branchId,
        title: homeworkDraft.title.trim(),
        description: homeworkDraft.description.trim(),
        dueDate: homeworkDraft.dueDate,
        lessonId: homeworkDraft.lessonId,
      });
    },
    onSuccess: () => {
      setHomeworkSaved(true);
      queryClient.invalidateQueries({ queryKey: ["homework"] });
      toast({ title: "Homework saved", description: "Parents can now see this homework.", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not save homework",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const previewDiary = useMutation({
    mutationFn: async () => {
      if (!lesson) throw new Error("Lesson not loaded");
      if (!confirmed) {
        await lessonsService.update(params.id, editPayload());
      }
      return documentsService.previewDiary({
        academicYearId: lesson.academicYearId ?? "",
        sectionId: lesson.sectionId ?? lesson.section?.id ?? "",
        branchId: lesson.branchId ?? "",
        date: lessonDate(lesson.date),
        lessonId: lesson.id,
        instruction: diaryInstruction.trim() || undefined,
      });
    },
    onSuccess: (draft) => {
      setDiaryDraft(draft);
      setDiarySaved(false);
    },
    onError: (err) => {
      toast({
        title: "Could not generate diary",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const saveDiary = useMutation({
    mutationFn: () => {
      if (!diaryDraft) throw new Error("No diary to save");
      return documentsService.createDiary({
        academicYearId: diaryDraft.academicYearId,
        sectionId: diaryDraft.sectionId,
        branchId: diaryDraft.branchId,
        date: lessonDate(diaryDraft.date),
        title: diaryDraft.title.trim(),
        lessonSummary: diaryDraft.lessonSummary,
        homeworkNotes: diaryDraft.homeworkNotes,
        teacherRemarks: diaryDraft.teacherRemarks,
      });
    },
    onSuccess: () => {
      setDiarySaved(true);
      toast({ title: "Diary saved", description: "The home diary is now finalized.", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not save diary",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  if (isLoading) {
    return <PageLoader variant="page" />;
  }

  if (isError || !lesson) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error)?.message ?? "Lesson not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Review extracted lesson"
        description="Photos were not saved. Check the page text, shape the key points, then generate homework and diary on this page."
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{topicName || chapterName || "Lesson"}</CardTitle>
                <CardDescription>
                  {formatDate(lesson.date)} · {lesson.subject?.name} · Section {lesson.section?.name}
                </CardDescription>
              </div>
              <Badge variant={confirmed ? "success" : "warning"}>{lesson.status.replaceAll("_", " ")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="extractedText">Content from the photos</Label>
              <Textarea
                id="extractedText"
                rows={14}
                className="whitespace-pre-wrap font-sans leading-relaxed"
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                disabled={confirmed}
              />
              <p className="text-xs text-muted-foreground">
                This is the data taken from the uploaded photos. Original images were discarded.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="chapterName">Chapter</Label>
                <Input id="chapterName" value={chapterName} onChange={(e) => setChapterName(e.target.value)} disabled={confirmed} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topicName">Topic</Label>
                <Input id="topicName" value={topicName} onChange={(e) => setTopicName(e.target.value)} disabled={confirmed} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pageFrom">Page from</Label>
                <Input id="pageFrom" type="number" value={pageFrom} onChange={(e) => setPageFrom(e.target.value)} disabled={confirmed} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pageTo">Page to</Label>
                <Input id="pageTo" type="number" value={pageTo} onChange={(e) => setPageTo(e.target.value)} disabled={confirmed} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacherNotes">Teacher notes</Label>
              <Textarea id="teacherNotes" rows={3} value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)} disabled={confirmed} />
            </div>
            {!confirmed && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : "Save extracted content"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-primary/15">
          <CardHeader className="bg-primary/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Key points
                </CardTitle>
                <CardDescription>
                  No lesson summary. Tell us how you want the points written for {gradeLabel}.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {regenerateKeyPoints.isPending ? (
              <AiWait kind="key-points" />
            ) : (
              <>
            {lesson.gradeStyle?.keyPointStyle && (
              <p className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Remembered for {gradeLabel}: {lesson.gradeStyle.keyPointStyle}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="concepts">Key points (one per line)</Label>
              <Textarea
                id="concepts"
                rows={8}
                className="whitespace-pre-wrap leading-relaxed"
                value={conceptsText}
                onChange={(e) => setConceptsText(e.target.value)}
                disabled={confirmed}
              />
            </div>
            {!confirmed && (
              <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                <Label htmlFor="keyPointInstruction">How should these key points be written?</Label>
                <StyleChips hints={KEY_POINT_HINTS} onPick={setKeyPointInstruction} />
                <Textarea
                  id="keyPointInstruction"
                  rows={3}
                  placeholder="Example: keep it easy and short, or keep it hard and long."
                  value={keyPointInstruction}
                  onChange={(e) => setKeyPointInstruction(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => regenerateKeyPoints.mutate()}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Regenerate key points
                  </Button>
                </div>
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/40">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Homework
            </CardTitle>
            <CardDescription>
              Generate and edit homework here. Write how you want it, and we remember that style for {gradeLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {previewHomework.isPending ? (
              <AiWait kind="homework" />
            ) : (
              <>
            {homeworkSaved && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Homework saved. Parents can see it now.
              </p>
            )}
            {lesson.gradeStyle?.homeworkStyle && (
              <p className="rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Remembered for {gradeLabel}: {lesson.gradeStyle.homeworkStyle}
              </p>
            )}
            <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
              <Label htmlFor="homeworkInstruction">How should this homework be written?</Label>
              <StyleChips hints={HOMEWORK_HINTS} onPick={setHomeworkInstruction} />
              <Textarea
                id="homeworkInstruction"
                rows={3}
                placeholder="Example: the homework is using hard English words, use easy words and keep it short."
                value={homeworkInstruction}
                onChange={(e) => setHomeworkInstruction(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => previewHomework.mutate()}
                >
                  <RefreshCw className="h-4 w-4" />
                  {homeworkDraft ? "Regenerate homework" : "Generate homework"}
                </Button>
              </div>
            </div>
            {homeworkDraft && (
              <div className="space-y-4 rounded-xl border p-4">
                <div className="space-y-2">
                  <Label htmlFor="hwTitle">Title</Label>
                  <Input
                    id="hwTitle"
                    value={homeworkDraft.title}
                    onChange={(e) => {
                      setHomeworkDraft({ ...homeworkDraft, title: e.target.value });
                      setHomeworkSaved(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hwDue">Due date</Label>
                  <Input
                    id="hwDue"
                    type="date"
                    value={homeworkDraft.dueDate.slice(0, 10)}
                    onChange={(e) => {
                      setHomeworkDraft({ ...homeworkDraft, dueDate: e.target.value });
                      setHomeworkSaved(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hwDesc">Homework</Label>
                  <Textarea
                    id="hwDesc"
                    rows={8}
                    value={homeworkDraft.description}
                    onChange={(e) => {
                      setHomeworkDraft({ ...homeworkDraft, description: e.target.value });
                      setHomeworkSaved(false);
                    }}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => saveHomework.mutate()} disabled={saveHomework.isPending || !homeworkDraft.title.trim()}>
                    {saveHomework.isPending ? "Saving…" : "Save homework"}
                  </Button>
                </div>
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/40">
            <CardTitle className="flex items-center gap-2">
              <NotebookPen className="h-4 w-4" />
              Home diary
            </CardTitle>
            <CardDescription>Generate and edit the diary on this page. Nothing is saved until you confirm.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {previewDiary.isPending ? (
              <AiWait kind="diary" />
            ) : (
              <>
            {diarySaved && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Diary saved for parents.
              </p>
            )}
            {lesson.gradeStyle?.diaryStyle && (
              <p className="rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Remembered for {gradeLabel}: {lesson.gradeStyle.diaryStyle}
              </p>
            )}
            <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
              <Label htmlFor="diaryInstruction">How should this diary be written?</Label>
              <StyleChips hints={DIARY_HINTS} onPick={setDiaryInstruction} />
              <Textarea
                id="diaryInstruction"
                rows={3}
                placeholder="Example: keep it short and easy for parents."
                value={diaryInstruction}
                onChange={(e) => setDiaryInstruction(e.target.value)}
              />
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => previewDiary.mutate()}>
                  <RefreshCw className="h-4 w-4" />
                  {diaryDraft ? "Regenerate diary" : "Generate diary"}
                </Button>
              </div>
            </div>
            {diaryDraft && (
              <div className="space-y-4 rounded-xl border p-4">
                <div className="space-y-2">
                  <Label htmlFor="diaryTitle">Title</Label>
                  <Input
                    id="diaryTitle"
                    value={diaryDraft.title}
                    onChange={(e) => {
                      setDiaryDraft({ ...diaryDraft, title: e.target.value });
                      setDiarySaved(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="diaryLessons">What we learned today</Label>
                  <Textarea
                    id="diaryLessons"
                    rows={6}
                    value={diaryDraft.lessonSummary}
                    onChange={(e) => {
                      setDiaryDraft({ ...diaryDraft, lessonSummary: e.target.value });
                      setDiarySaved(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="diaryHw">Homework notes</Label>
                  <Textarea
                    id="diaryHw"
                    rows={4}
                    value={diaryDraft.homeworkNotes}
                    onChange={(e) => {
                      setDiaryDraft({ ...diaryDraft, homeworkNotes: e.target.value });
                      setDiarySaved(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="diaryRemarks">Teacher remarks</Label>
                  <Textarea
                    id="diaryRemarks"
                    rows={3}
                    value={diaryDraft.teacherRemarks ?? ""}
                    onChange={(e) => {
                      setDiaryDraft({ ...diaryDraft, teacherRemarks: e.target.value });
                      setDiarySaved(false);
                    }}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => saveDiary.mutate()} disabled={saveDiary.isPending}>
                    <BookOpen className="h-4 w-4" />
                    {saveDiary.isPending ? "Saving…" : "Save diary"}
                  </Button>
                </div>
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>

        {!confirmed && (
          <div className="flex justify-end">
            <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              {confirmMutation.isPending ? "Confirming…" : "Confirm lesson"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
