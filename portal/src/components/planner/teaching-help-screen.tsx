"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fixDisplayText } from "@/lib/fix-display-text";
import { friendlyApiErrorMessage } from "@/lib/display-labels";
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

type TeachingHelpScreenProps = {
  lesson: TeachingHelpLessonContext;
  onBack: () => void;
};

function initialMode(lesson: TeachingHelpLessonContext): TeachingAssistanceMode {
  const isActivity = lesson.lessonKind === "ACTIVITY" || /activity|exercise/i.test(lesson.title);
  return isActivity ? "CLASSROOM_ACTIVITY" : "PREPARE_LESSON";
}

function text(value: string): string {
  return fixDisplayText(value);
}

export function TeachingHelpScreen({ lesson, onBack }: TeachingHelpScreenProps) {
  const [mode, setMode] = useState<TeachingAssistanceMode>(() => initialMode(lesson));
  const [draftQuestion, setDraftQuestion] = useState("");
  const [committedQuestion, setCommittedQuestion] = useState("");
  const [variety, setVariety] = useState(0);
  const [payload, setPayload] = useState<TeachingHelpPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    setMode(initialMode(lesson));
    setDraftQuestion("");
    setCommittedQuestion("");
    setVariety(0);
    setPayload(null);
    setError(null);
    setShowMore(false);
  }, [lesson.plannerId, lesson.lessonKey]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await academicPlannerService.teachingHelp(lesson.plannerId, lesson.lessonKey, {
          versionId: lesson.versionId,
          mode,
          question: committedQuestion.trim() || undefined,
          variety,
        });
        if (!cancelled) setPayload(result);
      } catch (e) {
        if (!cancelled) {
          setPayload(null);
          setError(friendlyApiErrorMessage(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [lesson.plannerId, lesson.lessonKey, lesson.versionId, mode, committedQuestion, variety]);

  const title = text(lesson.title);
  const chapter = lesson.chapterTitle ? text(lesson.chapterTitle) : "";
  const showChapter = Boolean(chapter) && !title.toLowerCase().includes(chapter.toLowerCase());
  const help = payload?.assistance;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight">Help me teach</h1>
          <p className="mt-1 text-sm text-muted-foreground">{title}</p>
          {showChapter && <p className="text-sm text-muted-foreground">{chapter}</p>}
          {(lesson.classLabel || lesson.subjectName) && (
            <p className="text-xs text-muted-foreground">
              {[lesson.classLabel, lesson.subjectName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
        <div className="space-y-1">
          <Label htmlFor="help-mode">What do you need?</Label>
          <select
            id="help-mode"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={mode}
            disabled={loading}
            onChange={(e) => {
              setMode(e.target.value as TeachingAssistanceMode);
              setVariety(0);
              setShowMore(false);
            }}
          >
            {MODES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="help-question">Anything specific? (optional)</Label>
          <Textarea
            id="help-question"
            rows={2}
            maxLength={500}
            disabled={loading}
            value={draftQuestion}
            onChange={(e) => setDraftQuestion(e.target.value)}
            placeholder="e.g. A five-minute start for students who missed yesterday"
          />
        </div>
        <Button
          type="button"
          disabled={loading}
          onClick={() => {
            setCommittedQuestion(draftQuestion);
            setVariety((current) => current + 1);
          }}
        >
          {loading ? "Preparing…" : "Try a different idea"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && !help && <p className="text-sm text-muted-foreground">Preparing a short plan…</p>}

      {help && !loading && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{payload?.aiGenerated ? "AI" : "Draft"}</Badge>
            {payload?.cached && <Badge variant="outline">Saved</Badge>}
          </div>

          <section className="space-y-1">
            <p className="font-medium">In short</p>
            <p className="text-muted-foreground">{text(help.overview.teachingOverview)}</p>
            {help.overview.estimatedDurationMinutes != null && (
              <p className="text-xs text-muted-foreground">About {help.overview.estimatedDurationMinutes} minutes</p>
            )}
          </section>

          {help.teacherExplanation.examples.length > 0 && (
            <section className="space-y-2 rounded-lg border bg-muted/30 p-4">
              <p className="font-medium">Example you can use</p>
              <ul className="list-disc space-y-1 pl-5">
                {help.teacherExplanation.examples.map((example, index) => (
                  <li key={index}>{text(example)}</li>
                ))}
              </ul>
            </section>
          )}

          {help.classroomDelivery.activity && (
            <section className="space-y-2 rounded-lg border p-4">
              <p className="font-medium">
                {text(help.classroomDelivery.activity.title)}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {help.classroomDelivery.activity.minutes} min
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Materials: {text(help.classroomDelivery.activity.materials)}
              </p>
              {mode === "CLASSROOM_ACTIVITY" && (
                <p className="text-muted-foreground">{text(help.classroomDelivery.warmUp)}</p>
              )}
              <ol className="list-decimal space-y-1 pl-5">
                {help.classroomDelivery.activity.steps.map((step, index) => (
                  <li key={index}>{text(step)}</li>
                ))}
              </ol>
              {mode === "CLASSROOM_ACTIVITY" && (
                <p className="text-muted-foreground">{text(help.classroomDelivery.recap)}</p>
              )}
            </section>
          )}

          {mode !== "CLASSROOM_ACTIVITY" && (
            <section className="space-y-2">
              <p className="font-medium">How to run it</p>
              <p className="text-muted-foreground">{text(help.classroomDelivery.warmUp)}</p>
              <ol className="list-decimal space-y-1 pl-5">
                {help.classroomDelivery.teachingSteps.slice(0, 4).map((step, index) => (
                  <li key={index}>{text(step)}</li>
                ))}
              </ol>
              <p className="text-muted-foreground">{text(help.classroomDelivery.recap)}</p>
            </section>
          )}

          <section className="space-y-2">
            <p className="font-medium">Check</p>
            {help.assessment.formativeQuestions.slice(0, 2).map((item, index) => (
              <div key={index}>
                <p>{text(item.question)}</p>
                <p className="text-xs text-muted-foreground">Look for: {text(item.expectedAnswer)}</p>
              </div>
            ))}
            <p className="text-muted-foreground">Exit: {text(help.assessment.exitTicket)}</p>
          </section>

          {(help.differentiation.struggling[0] || help.differentiation.extension[0]) && (
            <section className="space-y-1">
              <p className="font-medium">If the class splits</p>
              {help.differentiation.struggling[0] && (
                <p className="text-muted-foreground">Support: {text(help.differentiation.struggling[0])}</p>
              )}
              {help.differentiation.extension[0] && (
                <p className="text-muted-foreground">Stretch: {text(help.differentiation.extension[0])}</p>
              )}
            </section>
          )}

          <Button type="button" variant="ghost" size="sm" onClick={() => setShowMore((open) => !open)}>
            {showMore ? "Hide extra notes" : "More notes"}
          </Button>

          {showMore && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">What to say</p>
                <p>{text(help.teacherExplanation.simpleExplanation)}</p>
              </div>
              {help.learningObjectives.length > 0 && (
                <ul className="list-disc pl-5">
                  {help.learningObjectives.map((objective, index) => (
                    <li key={index}>{text(objective)}</li>
                  ))}
                </ul>
              )}
              {help.classroomDelivery.questionsDuringLesson.length > 0 && (
                <ul className="list-disc pl-5">
                  {help.classroomDelivery.questionsDuringLesson.map((question, index) => (
                    <li key={index}>{text(question)}</li>
                  ))}
                </ul>
              )}
              <p>{text(help.sourceAndConfidence.limitations)}</p>
            </div>
          )}

          {payload?.disclaimer && <p className="text-xs text-muted-foreground">{text(payload.disclaimer)}</p>}
        </div>
      )}
    </div>
  );
}
