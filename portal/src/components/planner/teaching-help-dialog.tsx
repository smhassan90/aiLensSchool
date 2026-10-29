"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatStatusLabel, friendlyApiErrorMessage } from "@/lib/display-labels";
import {
  academicPlannerService,
  type TeachingAssistanceMode,
  type TeachingHelpPayload,
} from "@/services/academic-planner.service";

const MODES: { value: TeachingAssistanceMode; label: string }[] = [
  { value: "PREPARE_LESSON", label: "Prepare lesson" },
  { value: "EXPLAIN_TOPIC", label: "Explain topic" },
  { value: "CREATE_QUESTIONS", label: "Create questions" },
  { value: "CLASSROOM_ACTIVITY", label: "Classroom activity" },
  { value: "DIFFERENTIATE", label: "Differentiate" },
];

export type TeachingHelpLessonContext = {
  plannerId: string;
  versionId?: string;
  lessonKey: string;
  title: string;
  lessonKind?: string;
  chapterTitle?: string | null;
  bookTitle?: string | null;
  classLabel?: string;
  subjectName?: string;
};

type TeachingHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: TeachingHelpLessonContext | null;
};

export function TeachingHelpDialog({ open, onOpenChange, lesson }: TeachingHelpDialogProps) {
  const [mode, setMode] = useState<TeachingAssistanceMode>("PREPARE_LESSON");
  const [question, setQuestion] = useState("");
  const [payload, setPayload] = useState<TeachingHelpPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !lesson) return;
    const isActivity =
      lesson.lessonKind === "ACTIVITY" || /activity|exercise/i.test(lesson.title);
    setMode(isActivity ? "CLASSROOM_ACTIVITY" : "PREPARE_LESSON");
    setQuestion(
      isActivity
        ? "Suggest a classroom activity that covers the main ideas from this chapter summary."
        : "",
    );
    setPayload(null);
    setError(null);
  }, [open, lesson?.lessonKey, lesson?.lessonKind, lesson?.title]);

  const resetOnClose = useCallback(
    (next: boolean) => {
      if (!next) {
        setPayload(null);
        setError(null);
        setQuestion("");
        setMode("PREPARE_LESSON");
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const generate = async () => {
    if (!lesson || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await academicPlannerService.teachingHelp(lesson.plannerId, lesson.lessonKey, {
        versionId: lesson.versionId,
        mode,
        question: question.trim() || undefined,
      });
      setPayload(result);
    } catch (e) {
      setPayload(null);
      setError(friendlyApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    if (!payload) return;
    const text = formatTeachingHelpPlainText(payload);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const basisLabel =
    payload?.basis === "CHAPTER_TEXT"
      ? "Textbook excerpt used"
      : payload?.basis === "OBJECTIVES_ONLY"
        ? "Objectives only (chapter text limited)"
        : "";

  return (
    <Dialog open={open} onOpenChange={resetOnClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Help me teach</DialogTitle>
          {lesson && (
            <p className="text-sm text-muted-foreground">
              {lesson.title}
              {lesson.chapterTitle ? ` · ${lesson.chapterTitle}` : ""}
              {lesson.bookTitle ? ` · ${lesson.bookTitle}` : ""}
            </p>
          )}
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          AI teaching suggestions — verify against your textbook. Not official curriculum or student records.
        </p>

        {lesson && (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label htmlFor="help-mode">Assistance mode</Label>
              <select
                id="help-mode"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={mode}
                disabled={loading}
                onChange={(e) => setMode(e.target.value as TeachingAssistanceMode)}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="help-question">Focus question (optional)</Label>
              <Textarea
                id="help-question"
                rows={2}
                maxLength={500}
                disabled={loading}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. How can I explain this with a real-life example?"
              />
            </div>
            <Button type="button" className="w-full" disabled={loading} onClick={() => void generate()}>
              {loading ? "Generating…" : payload ? "Regenerate" : "Generate"}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {payload && !loading && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {basisLabel && <Badge variant="secondary">{basisLabel}</Badge>}
              <Badge variant="outline">{formatStatusLabel(payload.mode)}</Badge>
              {payload.cached && <Badge variant="outline">Cached</Badge>}
              {payload.aiGenerated ? (
                <Badge variant="outline">AI generated</Badge>
              ) : (
                <Badge variant="outline">Template (not AI-grounded)</Badge>
              )}
            </div>

            <section>
              <p className="font-medium">Lesson overview</p>
              <p className="text-muted-foreground">{payload.assistance.overview.teachingOverview}</p>
              {payload.assistance.overview.estimatedDurationMinutes != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  ~{payload.assistance.overview.estimatedDurationMinutes} min
                  {payload.assistance.overview.durationIsSuggestion ? " (suggested)" : ""}
                </p>
              )}
            </section>

            <section>
              <p className="font-medium">Learning objectives</p>
              <ul className="list-disc pl-5">
                {payload.assistance.learningObjectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </section>

            <section>
              <p className="font-medium">Teacher explanation</p>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {payload.assistance.teacherExplanation.simpleExplanation}
              </p>
              {payload.assistance.teacherExplanation.stepByStep.length > 0 && (
                <ol className="list-decimal pl-5 mt-2 space-y-1">
                  {payload.assistance.teacherExplanation.stepByStep.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
              {payload.assistance.teacherExplanation.terminology.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {payload.assistance.teacherExplanation.terminology.map((t, i) => (
                    <li key={i}>
                      <span className="font-medium">{t.term}:</span> {t.definition}
                    </li>
                  ))}
                </ul>
              )}
              {payload.assistance.teacherExplanation.examples.length > 0 && (
                <ul className="list-disc pl-5 mt-2">
                  {payload.assistance.teacherExplanation.examples.map((ex, i) => (
                    <li key={i}>{ex}</li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="font-medium">Classroom delivery</p>
              <p className="text-muted-foreground">{payload.assistance.classroomDelivery.warmUp}</p>
              <ol className="list-decimal pl-5 mt-2 space-y-1">
                {payload.assistance.classroomDelivery.teachingSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <p className="font-medium mt-2">Questions during lesson</p>
              <ul className="list-disc pl-5">
                {payload.assistance.classroomDelivery.questionsDuringLesson.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              {payload.assistance.classroomDelivery.activity && (
                <div className="mt-2 rounded-md border p-2">
                  <p className="font-medium">
                    {payload.assistance.classroomDelivery.activity.title} (
                    {payload.assistance.classroomDelivery.activity.minutes} min)
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Materials: {payload.assistance.classroomDelivery.activity.materials}
                  </p>
                  <ul className="list-disc pl-5">
                    {payload.assistance.classroomDelivery.activity.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-muted-foreground">{payload.assistance.classroomDelivery.recap}</p>
            </section>

            <section>
              <p className="font-medium">Assessment</p>
              <ul className="space-y-2">
                {payload.assistance.assessment.formativeQuestions.map((fq, i) => (
                  <li key={i} className="rounded-md border p-2">
                    <p>{fq.question}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Expected: {fq.expectedAnswer} ({fq.kind})
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-medium">Exit ticket</p>
              <p className="text-muted-foreground">{payload.assistance.assessment.exitTicket}</p>
            </section>

            {(payload.assistance.differentiation.struggling.length > 0 ||
              payload.assistance.differentiation.extension.length > 0) && (
              <section>
                <p className="font-medium">Differentiation</p>
                {payload.assistance.differentiation.struggling.length > 0 && (
                  <>
                    <p className="text-xs font-medium">Support</p>
                    <ul className="list-disc pl-5">
                      {payload.assistance.differentiation.struggling.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                {payload.assistance.differentiation.extension.length > 0 && (
                  <>
                    <p className="text-xs font-medium mt-1">Extension</p>
                    <ul className="list-disc pl-5">
                      {payload.assistance.differentiation.extension.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            <section className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
              <p className="font-medium">Source and confidence</p>
              <p>Sources: {payload.assistance.sourceAndConfidence.sourcesUsed.join("; ")}</p>
              {payload.assistance.sourceAndConfidence.missingOrAmbiguous.length > 0 && (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {payload.assistance.sourceAndConfidence.missingOrAmbiguous.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground">{payload.assistance.sourceAndConfidence.limitations}</p>
            </section>

            {payload.contentExcerpt && (
              <section className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="font-medium mb-1">Source excerpt</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{payload.contentExcerpt}</p>
              </section>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyAll()}>
                Copy
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">{payload.disclaimer}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatTeachingHelpPlainText(payload: TeachingHelpPayload): string {
  const a = payload.assistance;
  const lines: string[] = [
    `${a.overview.lessonTitle} — ${payload.chapterTitle}`,
    a.overview.teachingOverview,
    "",
    "Objectives:",
    ...a.learningObjectives.map((o) => `- ${o}`),
    "",
    "Explanation:",
    a.teacherExplanation.simpleExplanation,
  ];
  return lines.join("\n");
}
