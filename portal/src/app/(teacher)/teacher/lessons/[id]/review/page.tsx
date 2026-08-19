"use client";

import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";
import { LessonWizardSteps, type LessonWizardStep } from "@/components/lessons/lesson-wizard-steps";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { documentsService, type HomeworkPreview } from "@/services/documents.service";
import { homeworkService } from "@/services/homework.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";

const KEY_POINT_HINTS = ["Easy words, keep it short", "Harder words, make it longer", "Make it in bullet points"];
const HOMEWORK_HINTS = ["Easy words and keep it short", "Use harder words and make it longer"];

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
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const styleHydrated = useRef(false);
  const homeworkAutoStarted = useRef(false);

  const [step, setStep] = useState<LessonWizardStep>("content");
  const [chapterName, setChapterName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [conceptsText, setConceptsText] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");
  const [keyPointInstruction, setKeyPointInstruction] = useState("");
  const [homeworkInstruction, setHomeworkInstruction] = useState("");
  const [homeworkDraft, setHomeworkDraft] = useState<HomeworkPreview | null>(null);
  const [homeworkSaved, setHomeworkSaved] = useState(false);

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

  const regenerateKeyPoints = useMutation({
    mutationFn: async () => {
      await lessonsService.update(params.id, editPayload());
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
      await lessonsService.update(params.id, editPayload());
      return documentsService.previewHomework({
        lessonId: params.id,
        dueDate: homeworkDraft?.dueDate,
        instruction: homeworkInstruction.trim() || undefined,
      });
    },
    onSuccess: (draft) => {
      setHomeworkDraft(draft);
      setHomeworkSaved(false);
      homeworkAutoStarted.current = true;
    },
    onError: (err) => {
      homeworkAutoStarted.current = false;
      toast({
        title: "Could not write homework",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const saveContent = useMutation({
    mutationFn: () => lessonsService.update(params.id, editPayload()),
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
      await lessonsService.update(params.id, editPayload());
      if (homeworkDraft && !homeworkSaved) {
        await homeworkService.create({
          academicYearId: homeworkDraft.academicYearId,
          sectionId: homeworkDraft.sectionId,
          subjectId: homeworkDraft.subjectId,
          branchId: homeworkDraft.branchId,
          title: homeworkDraft.title.trim(),
          description: homeworkDraft.description.trim(),
          dueDate: homeworkDraft.dueDate,
          lessonId: homeworkDraft.lessonId,
        });
      }
      return lessonsService.confirm(params.id);
    },
    onSuccess: (updated) => {
      setHomeworkSaved(true);
      queryClient.setQueryData(["lesson", params.id], updated);
      queryClient.invalidateQueries({ queryKey: ["teacher-lessons"] });
      queryClient.invalidateQueries({ queryKey: ["homework"] });
      toast({ title: "Lesson confirmed", description: "Parents can now see today’s lesson and homework.", variant: "success" });
      router.push("/teacher/lessons");
    },
    onError: (err) => {
      toast({
        title: "Confirmation failed",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  useEffect(() => {
    if (confirmed || step !== "homework" || homeworkDraft) return;
    if (homeworkAutoStarted.current) return;
    homeworkAutoStarted.current = true;
    previewHomework.mutate();
    // Auto-write homework when this step opens. Do not depend on the mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, step, homeworkDraft]);

  if (isLoading) {
    return <PageLoader variant="page" task="lesson-review" />;
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

  const keyPoints = conceptsText.split("\n").map((line) => line.trim()).filter(Boolean);
  const busy =
    regenerateKeyPoints.isPending ||
    previewHomework.isPending ||
    saveContent.isPending ||
    confirmMutation.isPending;

  const goToHomework = async () => {
    try {
      await saveContent.mutateAsync();
      homeworkAutoStarted.current = Boolean(homeworkDraft);
      setStep("homework");
    } catch {
      /* saveContent already toasts */
    }
  };

  if (confirmed) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader
          title={topicName || chapterName || "Lesson"}
          description={`${formatDate(lesson.date)} · ${lesson.subject?.name} · Section ${lesson.section?.name}`}
          actions={
            <Link href="/teacher/lessons">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
          }
        />
        <Badge variant="success" className="mb-4">Confirmed</Badge>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Content from the photos</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm leading-relaxed">{extractedText || "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Key points</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {keyPoints.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Today's lesson"
        description={
          step === "content"
            ? "Step 2: check the extracted pages and key points."
            : step === "homework"
              ? "Step 3: edit the homework if you need to, or regenerate it with a prompt."
              : "Step 4: look over everything once, then confirm."
        }
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <LessonWizardSteps current={step} />

      {step === "content" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{topicName || chapterName || "Extracted pages"}</CardTitle>
                  <CardDescription>
                    {formatDate(lesson.date)} · {lesson.subject?.name} · Section {lesson.section?.name}
                  </CardDescription>
                </div>
                <Badge variant="warning">{lesson.status.replaceAll("_", " ")}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="extractedText">Content from the photos</Label>
                <Textarea
                  id="extractedText"
                  rows={12}
                  className="whitespace-pre-wrap font-sans leading-relaxed"
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="chapterName">Chapter</Label>
                  <Input id="chapterName" value={chapterName} onChange={(e) => setChapterName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="topicName">Topic</Label>
                  <Input id="topicName" value={topicName} onChange={(e) => setTopicName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacherNotes">Teacher notes</Label>
                <Textarea id="teacherNotes" rows={3} value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key points</CardTitle>
              <CardDescription>One idea per line. Change the wording, then regenerate if you want a new list.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {regenerateKeyPoints.isPending ? (
                <AiWait kind="key-points" />
              ) : (
                <>
                  <Textarea
                    id="concepts"
                    rows={8}
                    className="whitespace-pre-wrap leading-relaxed"
                    value={conceptsText}
                    onChange={(e) => setConceptsText(e.target.value)}
                  />
                  <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                    <Label htmlFor="keyPointInstruction">How should these key points be written?</Label>
                    <StyleChips hints={KEY_POINT_HINTS} onPick={setKeyPointInstruction} />
                    <Textarea
                      id="keyPointInstruction"
                      rows={2}
                      placeholder="Example: keep it easy and short, or make it in bullet points."
                      value={keyPointInstruction}
                      onChange={(e) => setKeyPointInstruction(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" onClick={() => regenerateKeyPoints.mutate()}>
                        <RefreshCw className="h-4 w-4" />
                        Regenerate key points
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => void goToHomework()} disabled={busy || !extractedText.trim()}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === "homework" && (
        <div className="space-y-4">
          {previewHomework.isPending ? (
            <AiWait kind="homework" />
          ) : (
            <>
              {homeworkDraft && (
                <Card>
                  <CardHeader>
                    <CardTitle>Homework</CardTitle>
                    <CardDescription>
                      Written from today’s lesson. Edit it yourself, or regenerate it below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="hwTitle">Title</Label>
                      <Input
                        id="hwTitle"
                        value={homeworkDraft.title}
                        onChange={(e) => setHomeworkDraft({ ...homeworkDraft, title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hwDue">Due date</Label>
                      <Input
                        id="hwDue"
                        type="date"
                        value={homeworkDraft.dueDate.slice(0, 10)}
                        onChange={(e) => setHomeworkDraft({ ...homeworkDraft, dueDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hwDesc">Homework</Label>
                      <Textarea
                        id="hwDesc"
                        rows={8}
                        value={homeworkDraft.description}
                        onChange={(e) => setHomeworkDraft({ ...homeworkDraft, description: e.target.value })}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Regenerate homework</CardTitle>
                  <CardDescription>Tell us how to rewrite it for {gradeLabel}. This is separate from the homework above.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StyleChips hints={HOMEWORK_HINTS} onPick={setHomeworkInstruction} />
                  <Textarea
                    id="homeworkInstruction"
                    rows={3}
                    placeholder="Example: use easy words and keep it short."
                    value={homeworkInstruction}
                    onChange={(e) => setHomeworkInstruction(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={() => previewHomework.mutate()}>
                      <RefreshCw className="h-4 w-4" />
                      Regenerate homework
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          <div className="flex justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setStep("content")} disabled={previewHomework.isPending}>
              Back
            </Button>
            <Button onClick={() => setStep("review")} disabled={previewHomework.isPending || !homeworkDraft}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review once</CardTitle>
              <CardDescription>
                {formatDate(lesson.date)} · {lesson.subject?.name} · Section {lesson.section?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Chapter / topic</p>
                <p>{[chapterName, topicName].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Content from the photos</p>
                <p className="whitespace-pre-wrap leading-relaxed">{extractedText || "—"}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Key points</p>
                <ul className="list-disc space-y-1 pl-5">
                  {keyPoints.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Homework</p>
                <p className="font-medium">{homeworkDraft?.title}</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{homeworkDraft?.description}</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setStep("homework")} disabled={busy}>
              Back
            </Button>
            <Button onClick={() => confirmMutation.mutate()} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" />
              {confirmMutation.isPending ? "Confirming…" : "Confirm lesson"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
