"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonsService } from "@/services/lessons.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { coerceLessonDisplayText } from "@/lib/lesson-display-text";
import type { Lesson } from "@/lib/types";
import { AiWait } from "@/components/layout/ai-wait";
import { CheckCircle2, BookOpen, Sparkles } from "lucide-react";

export function ChapterContentWorkflow({
  lessonId,
  lesson,
  ready,
  chapterName,
  topicName,
  onChapterNameChange,
  onTopicNameChange,
  onLessonUpdated,
  onConfirm,
  confirmPending,
}: {
  lessonId: string;
  lesson: Lesson;
  ready: boolean;
  chapterName: string;
  topicName: string;
  onChapterNameChange: (value: string) => void;
  onTopicNameChange: (value: string) => void;
  onLessonUpdated: (lesson: Lesson) => void;
  onConfirm: (compiledFullText: string) => void;
  confirmPending: boolean;
}) {
  const { toast } = useToast();
  const [draftText, setDraftText] = useState("");
  const [compiledBody, setCompiledBody] = useState("");
  const [compiledExercises, setCompiledExercises] = useState("");
  const [compileInstruction, setCompileInstruction] = useState("");
  const [draftTouched, setDraftTouched] = useState(false);

  useEffect(() => {
    if (!draftTouched) {
      setDraftText(coerceLessonDisplayText(lesson.chapterDraftText ?? lesson.chapterPageText ?? ""));
    }
    setCompiledBody(coerceLessonDisplayText(lesson.chapterCompiledBody ?? ""));
    setCompiledExercises(coerceLessonDisplayText(lesson.chapterCompiledExercises ?? ""));
  }, [lesson, draftTouched]);

  const saveDraft = useMutation({
    mutationFn: () =>
      lessonsService.update(lessonId, {
        chapterName: chapterName.trim(),
        topicName: topicName.trim(),
        chapterDraftText: draftText,
      }),
    onSuccess: (updated) => {
      setDraftTouched(false);
      onLessonUpdated(updated);
      toast({ title: "Draft saved", variant: "success" });
    },
    onError: (err) =>
      toast({
        title: "Could not save draft",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  const compile = useMutation({
    mutationFn: () => {
      const sourceText = sourceForCompile();
      if (!sourceText.trim()) {
        throw new Error("Upload pages and assemble text before compiling.");
      }
      return lessonsService.compileChapter(lessonId, {
        sourceText,
        instruction: compileInstruction.trim() || undefined,
      });
    },
    onSuccess: (result) => {
      setCompiledBody(coerceLessonDisplayText(result.compile.lessonBody));
      setCompiledExercises(coerceLessonDisplayText(result.compile.exercises));
      if (result.compile.chapterName) onChapterNameChange(result.compile.chapterName);
      if (result.compile.topicName) onTopicNameChange(result.compile.topicName ?? "");
      onLessonUpdated(result);
      toast({ title: "Lesson compiled", description: "Review the compiled version below.", variant: "success" });
    },
    onError: (err) =>
      toast({
        title: "Could not compile",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  const assemblePagesForCompile = () => {
    const fromPages = coerceLessonDisplayText(lesson.chapterPageText ?? "");
    if (!fromPages.trim()) {
      toast({
        title: "No page text yet",
        description: "Upload each page until it shows Text captured (90%+ read), then assemble or compile.",
        variant: "error",
      });
      return;
    }
    setDraftText(fromPages);
    setDraftTouched(true);
    toast({
      title: "Pages assembled",
      description: "Text is in page order. Edit if needed, then compile.",
      variant: "success",
    });
  };

  const sourceForCompile = () =>
    draftText.trim() || coerceLessonDisplayText(lesson.chapterPageText ?? "");

  const compiledFull = [compiledBody, compiledExercises].filter(Boolean).join(
    compiledExercises ? "\n\n## Exercises\n\n" : "",
  );
  const isRtl = /[\u0600-\u06FF]/.test(draftText + compiledBody);

  if (compile.isPending) {
    return <AiWait kind="extract" variant="panel" />;
  }

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Raw page text
          </CardTitle>
          <CardDescription>
            After each page is uploaded, use Read fetched text on that row. When order is right, assemble all
            pages here (or compile directly — pages are merged in photo order).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Chapter</Label>
              <Input value={chapterName} onChange={(e) => onChapterNameChange(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={topicName} onChange={(e) => onTopicNameChange(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={assemblePagesForCompile}>
              Assemble all pages
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saveDraft.isPending || !draftText.trim()}
              onClick={() => saveDraft.mutate()}
            >
              Save draft text
            </Button>
          </div>
          <Textarea
            rows={14}
            dir={isRtl ? "rtl" : "ltr"}
            className="min-h-[14rem] font-sans leading-relaxed"
            value={draftText}
            onChange={(e) => {
              setDraftTouched(true);
              setDraftText(e.target.value);
            }}
            placeholder="Assemble all pages, or edit the combined text before compile…"
          />
          {!ready && (
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!sourceForCompile().trim() || compile.isPending}
              onClick={() => compile.mutate()}
            >
              <Sparkles className="h-4 w-4" />
              Compile the lesson
            </Button>
          )}
        </CardContent>
      </Card>

      {(compiledBody || compiledExercises) && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Compiled lesson</CardTitle>
            <CardDescription>
              AI cleaned page markers and separated exercises. Approve or regenerate with instructions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Lesson content</Label>
              <div
                className="max-h-[24rem] overflow-y-auto rounded-lg border bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-wrap"
                dir={isRtl ? "rtl" : "ltr"}
              >
                {compiledBody || "—"}
              </div>
            </div>
            {compiledExercises ? (
              <div className="space-y-2">
                <Label>Exercises &amp; activities</Label>
                <div
                  className="max-h-[20rem] overflow-y-auto rounded-lg border border-dashed bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap"
                  dir={isRtl ? "rtl" : "ltr"}
                >
                  {compiledExercises}
                </div>
              </div>
            ) : null}
            {!ready && (
              <>
                <div className="space-y-2 border-t pt-4">
                  <Label htmlFor="compileInstruction">Regenerate with instructions (optional)</Label>
                  <Textarea
                    id="compileInstruction"
                    rows={3}
                    value={compileInstruction}
                    onChange={(e) => setCompileInstruction(e.target.value)}
                    placeholder="e.g. Keep Urdu headings, merge activity 2 with the story section…"
                  />
                  <Button type="button" variant="outline" onClick={() => compile.mutate()}>
                    Regenerate compile
                  </Button>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                  <Button
                    disabled={confirmPending || !compiledFull.trim()}
                    onClick={() => onConfirm(compiledFull)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve compiled lesson
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
