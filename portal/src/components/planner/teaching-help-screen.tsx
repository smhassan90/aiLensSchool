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
  type TeachingHelpUrduGuide,
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

function isPartExample(line: string): boolean {
  return /^Part\s+\d+/i.test(line.trim());
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
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const [urduGuide, setUrduGuide] = useState<TeachingHelpUrduGuide | null>(null);
  const [urduLoading, setUrduLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode(lesson));
    setDraftQuestion("");
    setCommittedQuestion("");
    setVariety(0);
    setPayload(null);
    setError(null);
    setShowMore(false);
    setLanguage("en");
    setUrduGuide(null);
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
        if (!cancelled) {
          setPayload(result);
          setUrduGuide(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPayload(null);
          setUrduGuide(null);
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

  const loadUrdu = async () => {
    if (urduGuide) {
      setLanguage("ur");
      return;
    }
    setUrduLoading(true);
    setError(null);
    try {
      const result = await academicPlannerService.teachingHelpUrdu(lesson.plannerId, lesson.lessonKey, {
        versionId: lesson.versionId,
        mode,
        variety,
      });
      setUrduGuide(result.urduGuide ?? null);
      setLanguage("ur");
    } catch (e) {
      setError(friendlyApiErrorMessage(e));
    } finally {
      setUrduLoading(false);
    }
  };

  const title = text(lesson.title);
  const chapter = lesson.chapterTitle ? text(lesson.chapterTitle) : "";
  const showChapter = Boolean(chapter) && !title.toLowerCase().includes(chapter.toLowerCase());
  const help = payload?.assistance;

  const isChapterRecap =
    help?.classroomDelivery.activity?.title === "Chapter recap" &&
    help.sourceAndConfidence.sourceSupportedClaims.length > 0;

  const openingExample = help?.teacherExplanation.examples.find((line) => !isPartExample(line));
  const partExamples = help?.teacherExplanation.examples.filter((line) => isPartExample(line)) ?? [];
  const studentTemplate = help?.sourceAndConfidence.pedagogicalSuggestions.find((line) =>
    /student work template/i.test(line),
  );

  const bodyClass = "text-base leading-relaxed text-foreground";
  const mutedClass = "text-base leading-relaxed text-muted-foreground";
  const urduClass = "text-lg leading-loose text-foreground";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Help me teach</h1>
          <p className="mt-1 text-base text-muted-foreground">{title}</p>
          {showChapter && <p className="text-base text-muted-foreground">{chapter}</p>}
          {(lesson.classLabel || lesson.subjectName) && (
            <p className="text-sm text-muted-foreground">
              {[lesson.classLabel, lesson.subjectName].filter(Boolean).join(" · ")}
            </p>
          )}
          {help && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={language === "en" ? "default" : "outline"}
                disabled={loading || urduLoading}
                onClick={() => setLanguage("en")}
              >
                English
              </Button>
              <Button
                type="button"
                size="sm"
                variant={language === "ur" ? "default" : "outline"}
                disabled={loading || urduLoading}
                onClick={() => void loadUrdu()}
              >
                {urduLoading ? "لوڈ ہو رہا ہے…" : "اردو میں دیکھیں"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4 text-base">
        <div className="space-y-1">
          <Label htmlFor="help-mode">What do you need?</Label>
          <select
            id="help-mode"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
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
            className="text-base"
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

      {error && <p className="text-base text-destructive">{error}</p>}
      {loading && !help && <p className={mutedClass}>Preparing a short plan…</p>}

      {help && !loading && language === "ur" && urduGuide && (
        <div className="space-y-5" dir="rtl" lang="ur">
          <section className="space-y-2">
            <p className="text-lg font-semibold">خلاصہ</p>
            <p className={urduClass}>{text(urduGuide.teachingOverview)}</p>
          </section>
          {urduGuide.boardParts.length > 0 && (
            <section className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <p className="text-lg font-semibold">بورڈ پر حصے</p>
              <ol className="list-decimal space-y-2 pr-5 text-lg leading-loose">
                {urduGuide.boardParts.map((part, index) => (
                  <li key={index}>{text(part)}</li>
                ))}
              </ol>
            </section>
          )}
          <section className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-lg font-semibold">آپ کیا کہیں / مثالیں</p>
            <p className={urduClass}>{text(urduGuide.openingLine)}</p>
            <ul className="space-y-3">
              {urduGuide.partExamples.map((example, index) => (
                <li key={index} className="rounded-md border bg-background p-3 text-lg leading-loose">
                  {text(example)}
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2 rounded-lg border p-4">
            <p className="text-lg font-semibold">طلبہ کے لیے نمونہ (بورڈ پر لکھیں)</p>
            <p className={urduClass}>{text(urduGuide.studentWorkTemplate)}</p>
          </section>
          <section className="space-y-2 rounded-lg border p-4">
            <p className="text-lg font-semibold">کلاس میں کیسے چلائیں</p>
            <p className={urduClass}>{text(urduGuide.warmUp)}</p>
            <ol className="list-decimal space-y-2 pr-5 text-lg leading-loose">
              {urduGuide.steps.map((step, index) => (
                <li key={index}>{text(step)}</li>
              ))}
            </ol>
            <p className={urduClass}>{text(urduGuide.recap)}</p>
          </section>
          <section className="space-y-2">
            <p className="text-lg font-semibold">جانچ</p>
            <p className={urduClass}>{text(urduGuide.checkQuestion)}</p>
            <p className="text-base text-muted-foreground">دیکھیں: {text(urduGuide.expectedAnswer)}</p>
            <p className={urduClass}>اختتام: {text(urduGuide.exitTicket)}</p>
          </section>
        </div>
      )}

      {help && !loading && language === "en" && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{payload?.aiGenerated ? "AI" : "Draft"}</Badge>
            {payload?.cached && <Badge variant="outline">Saved</Badge>}
          </div>

          <section className="space-y-2">
            <p className="text-lg font-semibold">In short</p>
            <p className={mutedClass}>{text(help.overview.teachingOverview)}</p>
            {help.overview.estimatedDurationMinutes != null && (
              <p className="text-sm text-muted-foreground">About {help.overview.estimatedDurationMinutes} minutes</p>
            )}
          </section>

          {isChapterRecap && (
            <section className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <p className="text-lg font-semibold">Parts to put on the board</p>
              <ol className="list-decimal space-y-2 pl-5 text-base leading-relaxed">
                {help.sourceAndConfidence.sourceSupportedClaims.slice(0, 5).map((part, index) => (
                  <li key={index}>{text(part)}</li>
                ))}
              </ol>
            </section>
          )}

          {studentTemplate && (
            <section className="space-y-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4">
              <p className="text-lg font-semibold">Template for students (put on the board)</p>
              <p className={bodyClass}>{text(studentTemplate.replace(/^Student work template[^:]*:\s*/i, ""))}</p>
              <p className="text-sm text-muted-foreground">
                Students copy this layout for their group part — they follow your examples in “Examples for you”.
              </p>
            </section>
          )}

          {(openingExample || partExamples.length > 0) && (
            <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-lg font-semibold">Examples for you</p>
              {openingExample && <p className={bodyClass}>{text(openingExample)}</p>}
              {partExamples.length > 0 && (
                <ul className="space-y-3">
                  {partExamples.map((example, index) => (
                    <li
                      key={index}
                      className="rounded-md border bg-background p-3 text-base leading-relaxed"
                    >
                      {text(example)}
                    </li>
                  ))}
                </ul>
              )}
              {!partExamples.length &&
                help.teacherExplanation.examples
                  .filter((line) => line !== openingExample)
                  .map((example, index) => (
                    <p key={index} className={bodyClass}>
                      {text(example)}
                    </p>
                  ))}
            </section>
          )}

          {help.classroomDelivery.activity && (
            <section className="space-y-3 rounded-lg border p-4">
              <p className="text-lg font-semibold">
                {text(help.classroomDelivery.activity.title)}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {help.classroomDelivery.activity.minutes} min
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Materials: {text(help.classroomDelivery.activity.materials)}
              </p>
              {mode === "CLASSROOM_ACTIVITY" && (
                <p className={mutedClass}>{text(help.classroomDelivery.warmUp)}</p>
              )}
              <p className="text-lg font-medium">Steps</p>
              <ol className="list-decimal space-y-2 pl-5 text-base leading-relaxed">
                {help.classroomDelivery.activity.steps.map((step, index) => (
                  <li key={index}>{text(step)}</li>
                ))}
              </ol>
              {mode === "CLASSROOM_ACTIVITY" && (
                <p className={mutedClass}>{text(help.classroomDelivery.recap)}</p>
              )}
            </section>
          )}

          {mode !== "CLASSROOM_ACTIVITY" && (
            <section className="space-y-2">
              <p className="text-lg font-semibold">How to run it</p>
              <p className={mutedClass}>{text(help.classroomDelivery.warmUp)}</p>
              <ol className="list-decimal space-y-2 pl-5 text-base leading-relaxed">
                {help.classroomDelivery.teachingSteps.slice(0, 4).map((step, index) => (
                  <li key={index}>{text(step)}</li>
                ))}
              </ol>
              <p className={mutedClass}>{text(help.classroomDelivery.recap)}</p>
            </section>
          )}

          <section className="space-y-3">
            <p className="text-lg font-semibold">Check</p>
            {help.assessment.formativeQuestions.slice(0, 2).map((item, index) => (
              <div key={index} className="space-y-1">
                <p className={bodyClass}>{text(item.question)}</p>
                <p className="text-sm text-muted-foreground">Look for: {text(item.expectedAnswer)}</p>
              </div>
            ))}
            <p className={mutedClass}>Exit: {text(help.assessment.exitTicket)}</p>
          </section>

          {(help.differentiation.struggling[0] || help.differentiation.extension[0]) && (
            <section className="space-y-2">
              <p className="text-lg font-semibold">If the class splits</p>
              {help.differentiation.struggling[0] && (
                <p className={mutedClass}>Support: {text(help.differentiation.struggling[0])}</p>
              )}
              {help.differentiation.extension[0] && (
                <p className={mutedClass}>Stretch: {text(help.differentiation.extension[0])}</p>
              )}
            </section>
          )}

          {help.sourceAndConfidence.limitations && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              {text(help.sourceAndConfidence.limitations)}
            </p>
          )}

          <Button type="button" variant="ghost" size="sm" onClick={() => setShowMore((open) => !open)}>
            {showMore ? "Hide extra notes" : "More notes"}
          </Button>

          {showMore && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-base leading-relaxed text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">What to say</p>
                <p>{text(help.teacherExplanation.simpleExplanation)}</p>
              </div>
              {help.learningObjectives.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {help.learningObjectives.map((objective, index) => (
                    <li key={index}>{text(objective)}</li>
                  ))}
                </ul>
              )}
              {help.classroomDelivery.questionsDuringLesson.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {help.classroomDelivery.questionsDuringLesson.map((question, index) => (
                    <li key={index}>{text(question)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {payload?.disclaimer && <p className="text-sm text-muted-foreground">{text(payload.disclaimer)}</p>}
        </div>
      )}
    </div>
  );
}
