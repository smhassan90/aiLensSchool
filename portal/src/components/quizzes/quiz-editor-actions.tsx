"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError } from "@/lib/api-client";
import type { Quiz } from "@/lib/types";
import { useToast } from "@/providers/toast-provider";
import { quizzesService } from "@/services/quizzes.service";

interface QuizEditorActionsProps {
  quizId: string;
  quiz: Quiz;
  listHref: string;
  listQueryKey: unknown[];
}

function questionPayload(quiz: Quiz) {
  return (quiz.questions ?? []).map((q) => ({
    id: q.id,
    included: q.included,
    questionText: q.questionText,
    marks: Number(q.marks),
  }));
}

function localDateTimeToIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function QuizEditorActions({
  quizId,
  quiz,
  listHref,
  listQueryKey,
}: QuizEditorActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<"immediate" | "schedule">("immediate");
  const [dueAt, setDueAt] = useState("");

  const includedCount = quiz.questions?.filter((q) => q.included).length ?? 0;

  const saveDraft = useMutation({
    mutationFn: () => quizzesService.updateQuestions(quizId, questionPayload(quiz)),
    onSuccess: () => {
      toast({ title: "Draft saved", description: "The system headline was kept.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["quiz", quizId] });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => {
      toast({
        title: "Could not save draft",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      });
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (includedCount === 0) {
        throw new Error("Include at least one question before publishing");
      }
      if (publishMode === "schedule" && !dueAt) {
        throw new Error("Choose a date and time");
      }
      await quizzesService.updateQuestions(quizId, questionPayload(quiz));
      return quizzesService.publish(
        quizId,
        publishMode === "immediate"
          ? { immediate: true }
          : { dueAt: localDateTimeToIso(dueAt) },
      );
    },
    onSuccess: () => {
      toast({
        title: publishMode === "immediate" ? "Quiz published" : "Quiz published with due date",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["quiz", quizId] });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      setPublishOpen(false);
      router.push(listHref);
    },
    onError: (err) => {
      toast({
        title: "Publish failed",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      });
    },
  });

  if (quiz.status === "PUBLISHED") return null;

  const busy = saveDraft.isPending || publish.isPending;

  return (
    <>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => saveDraft.mutate()}
        >
          <FileText className="h-4 w-4" />
          {saveDraft.isPending ? "Saving…" : "Save as draft"}
        </Button>
        <Button
          type="button"
          disabled={busy || includedCount === 0}
          onClick={() => {
            setPublishMode("immediate");
            setDueAt("");
            setPublishOpen(true);
          }}
        >
          <Send className="h-4 w-4" />
          Publish
        </Button>
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent onClose={() => setPublishOpen(false)}>
          <DialogHeader>
            <DialogTitle>Publish quiz</DialogTitle>
            <DialogDescription>
              Publish now, or set a due date and time for students.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <input
                type="radio"
                name="publish-when"
                className="mt-1"
                checked={publishMode === "immediate"}
                onChange={() => setPublishMode("immediate")}
              />
              <span>
                <span className="block text-sm font-medium">Immediate publish</span>
                <span className="text-sm text-muted-foreground">
                  Students can take the quiz right away. No due date.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <input
                type="radio"
                name="publish-when"
                className="mt-1"
                checked={publishMode === "schedule"}
                onChange={() => setPublishMode("schedule")}
              />
              <span className="w-full">
                <span className="block text-sm font-medium">Set date and time</span>
                <span className="text-sm text-muted-foreground">
                  Publish now and set when the quiz is due.
                </span>
                {publishMode === "schedule" && (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="due-at">Due date and time</Label>
                    <Input
                      id="due-at"
                      type="datetime-local"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                    />
                  </div>
                )}
              </span>
            </label>
            {includedCount === 0 && (
              <p className="text-sm text-destructive">Include at least one question before publishing.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPublishOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  publish.isPending ||
                  includedCount === 0 ||
                  (publishMode === "schedule" && !dueAt)
                }
                onClick={() => publish.mutate()}
              >
                {publish.isPending ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
