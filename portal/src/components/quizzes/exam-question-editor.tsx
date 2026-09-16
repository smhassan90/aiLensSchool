"use client";

import { useMemo, useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { QuizReviewQuestion } from "@/components/quizzes/quiz-review-question";
import type { Quiz, QuizQuestion } from "@/lib/types";
import { quizzesService } from "@/services/quizzes.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

type QuestionType = "MCQ" | "TRUE_FALSE" | "FILL_IN_THE_BLANK" | "SHORT_ANSWER";
type McqChoice = "A" | "B" | "C" | "D";

const MCQ_CHOICES: McqChoice[] = ["A", "B", "C", "D"];

const emptyMcqOptions = (): Record<McqChoice, string> => ({
  A: "",
  B: "",
  C: "",
  D: "",
});

function sortQuestions(questions: QuizQuestion[]) {
  return [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function ExamQuestionEditor({
  quizId,
  quiz,
  onChange,
}: {
  quizId: string;
  quiz: Quiz;
  onChange: (next: Quiz) => void;
}) {
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customType, setCustomType] = useState<QuestionType>("MCQ");
  const [customMarks, setCustomMarks] = useState(2);
  const [customText, setCustomText] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [mcqOptions, setMcqOptions] = useState(emptyMcqOptions);
  const [mcqCorrect, setMcqCorrect] = useState<McqChoice>("A");

  const ordered = useMemo(() => sortQuestions(quiz.questions ?? []), [quiz.questions]);

  const resetCustomForm = () => {
    setCustomText("");
    setCustomAnswer("");
    setMcqOptions(emptyMcqOptions());
    setMcqCorrect("A");
    setCustomMarks(2);
    setCustomType("MCQ");
  };

  const toggleQuestion = (questionId: string) => {
    onChange({
      ...quiz,
      questions: quiz.questions?.map((q) =>
        q.id === questionId ? { ...q, included: !q.included } : q,
      ),
    });
  };

  const persistOrder = async (nextQuestions: QuizQuestion[]) => {
    setSaving(true);
    try {
      const payload = nextQuestions.map((q, index) => ({
        id: q.id,
        included: q.included,
        questionText: q.questionText,
        marks: Number(q.marks),
        correctAnswer: q.correctAnswer,
        type: q.type,
        order: index,
      }));
      const updated = await quizzesService.updateQuestions(quizId, payload, quiz.title);
      onChange(updated);
    } catch (err) {
      toast({
        title: "Could not save order",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = ordered.findIndex((q) => q.id === dragId);
    const to = ordered.findIndex((q) => q.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...ordered];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ ...quiz, questions: next.map((q, index) => ({ ...q, order: index })) });
    void persistOrder(next);
    setDragId(null);
  };

  const addCustomQuestion = async () => {
    if (!customText.trim()) {
      toast({ title: "Enter the question text", variant: "error" });
      return;
    }
    if (customType === "MCQ") {
      const missing = MCQ_CHOICES.filter((choice) => !mcqOptions[choice].trim());
      if (missing.length) {
        toast({
          title: "Enter all four options",
          description: `Option${missing.length > 1 ? "s" : ""} ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} empty.`,
          variant: "error",
        });
        return;
      }
    }
    if (customType === "TRUE_FALSE" && !["TRUE", "FALSE"].includes(customAnswer.toUpperCase())) {
      toast({ title: "Choose TRUE or FALSE as the correct answer", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const options =
        customType === "TRUE_FALSE"
          ? [
              { optionText: "TRUE", isCorrect: customAnswer.toUpperCase() === "TRUE" },
              { optionText: "FALSE", isCorrect: customAnswer.toUpperCase() === "FALSE" },
            ]
          : customType === "MCQ"
            ? MCQ_CHOICES.map((choice) => ({
                optionText: mcqOptions[choice].trim(),
                isCorrect: choice === mcqCorrect,
              }))
            : undefined;
      const correctAnswer =
        customType === "MCQ"
          ? mcqOptions[mcqCorrect].trim()
          : customAnswer.trim() || undefined;
      const updated = await quizzesService.addQuestion(quizId, {
        type: customType,
        questionText: customText.trim(),
        marks: customMarks,
        correctAnswer,
        options,
      });
      onChange(updated);
      resetCustomForm();
      setAdding(false);
      toast({ title: "Question added", variant: "success" });
    } catch (err) {
      toast({
        title: "Could not add question",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Drag questions to reorder. Toggle include/exclude, or add your own question below.
        {saving ? " Saving…" : ""}
      </p>

      <div className="space-y-3">
        {ordered.map((question, index) => (
          <div
            key={question.id}
            draggable
            onDragStart={() => setDragId(question.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(question.id)}
            className="flex gap-2 rounded-lg border bg-card p-2"
          >
            <button
              type="button"
              className="mt-2 cursor-grab text-muted-foreground active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <QuizReviewQuestion
                question={question}
                index={index}
                dimmed={!question.included}
                action={
                  <Button
                    size="sm"
                    variant={question.included ? "default" : "outline"}
                    onClick={() => toggleQuestion(question.id)}
                  >
                    {question.included ? "Included" : "Excluded"}
                  </Button>
                }
              />
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Question type</Label>
              <Select value={customType} onChange={(e) => setCustomType(e.target.value as QuestionType)}>
                <option value="MCQ">Multiple choice</option>
                <option value="TRUE_FALSE">True / False</option>
                <option value="FILL_IN_THE_BLANK">Fill in the blank</option>
                <option value="SHORT_ANSWER">Open-ended</option>
              </Select>
            </div>
            <div>
              <Label>Marks</Label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={customMarks}
                onChange={(e) => setCustomMarks(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <div>
            <Label>Question</Label>
            <Textarea value={customText} onChange={(e) => setCustomText(e.target.value)} rows={3} />
          </div>
          {customType === "MCQ" ? (
            <div className="space-y-3">
              <Label>Options</Label>
              <div className="grid gap-2">
                {MCQ_CHOICES.map((choice) => (
                  <div key={choice} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground">{choice}.</span>
                    <Input
                      value={mcqOptions[choice]}
                      onChange={(e) =>
                        setMcqOptions((prev) => ({ ...prev, [choice]: e.target.value }))
                      }
                      placeholder={`Option ${choice}`}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcq-correct">Correct answer</Label>
                <Select
                  id="mcq-correct"
                  value={mcqCorrect}
                  onChange={(e) => setMcqCorrect(e.target.value as McqChoice)}
                >
                  {MCQ_CHOICES.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                      {mcqOptions[choice].trim() ? ` — ${mcqOptions[choice].trim()}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : (
            <div>
              <Label>
                {customType === "TRUE_FALSE"
                  ? "Correct answer (TRUE or FALSE)"
                  : "Model answer (optional)"}
              </Label>
              {customType === "TRUE_FALSE" ? (
                <Select
                  value={customAnswer}
                  onChange={(e) => setCustomAnswer(e.target.value)}
                >
                  <option value="">Select answer</option>
                  <option value="TRUE">TRUE</option>
                  <option value="FALSE">FALSE</option>
                </Select>
              ) : (
                <Input value={customAnswer} onChange={(e) => setCustomAnswer(e.target.value)} />
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={() => void addCustomQuestion()} disabled={saving}>
              Add question
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetCustomForm();
                setAdding(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Add custom question
        </Button>
      )}
    </div>
  );
}
