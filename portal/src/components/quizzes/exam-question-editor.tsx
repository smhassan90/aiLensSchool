"use client";

import { useMemo, useState } from "react";
import { GripVertical, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { QuizMixFields } from "@/components/quizzes/quiz-mix-fields";
import { AiWait } from "@/components/layout/ai-wait";
import type { Quiz, QuizQuestion } from "@/lib/types";
import { quizQuestionTypeLabel } from "@/lib/utils";
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

function questionPayloadFromList(questions: QuizQuestion[]) {
  return questions.map((q, index) => ({
    id: q.id,
    included: q.included,
    questionText: q.questionText,
    marks: Number(q.marks),
    correctAnswer: q.correctAnswer,
    type: q.type,
    order: index,
    options: q.options?.map((opt) => ({
      optionText: opt.optionText,
      isCorrect: opt.isCorrect,
    })),
  }));
}

function DraftQuestionFields({
  question,
  index,
  dimmed,
  onPatch,
  onBlurSave,
  action,
}: {
  question: QuizQuestion;
  index: number;
  dimmed?: boolean;
  onPatch: (patch: Partial<QuizQuestion>) => void;
  onBlurSave: () => void;
  action?: React.ReactNode;
}) {
  const options = question.options ?? [];
  const isMcq = question.type === "MCQ";
  const isTf = question.type === "TRUE_FALSE";

  const setOptionText = (optIndex: number, text: string) => {
    const next = options.map((opt, i) =>
      i === optIndex ? { ...opt, optionText: text } : opt,
    );
    onPatch({ options: next });
  };

  const setMcqCorrect = (optIndex: number) => {
    const next = options.map((opt, i) => ({
      ...opt,
      isCorrect: i === optIndex,
    }));
    const correct = next[optIndex]?.optionText?.trim();
    onPatch({
      options: next,
      correctAnswer: correct || question.correctAnswer,
    });
  };

  const setTfCorrect = (value: string) => {
    const upper = value.toUpperCase();
    onPatch({
      correctAnswer: upper,
      options: [
        { optionText: "TRUE", isCorrect: upper === "TRUE" },
        { optionText: "FALSE", isCorrect: upper === "FALSE" },
      ],
    });
  };

  return (
    <div
      className={`rounded-lg border bg-card p-3 sm:p-4 ${dimmed ? "opacity-60" : ""}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Q{index + 1}</span>
          <Badge variant="secondary">{quizQuestionTypeLabel(question.type)}</Badge>
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`marks-${question.id}`} className="sr-only">Marks</Label>
            <Input
              id={`marks-${question.id}`}
              type="number"
              min={0.5}
              step={0.5}
              className="h-8 w-20"
              value={Number(question.marks)}
              onChange={(e) => onPatch({ marks: Number(e.target.value) || 1 })}
              onBlur={onBlurSave}
            />
            <span className="text-xs text-muted-foreground">marks</span>
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-3">
        <div>
          <Label htmlFor={`text-${question.id}`}>Question</Label>
          <Textarea
            id={`text-${question.id}`}
            value={question.questionText}
            onChange={(e) => onPatch({ questionText: e.target.value })}
            onBlur={onBlurSave}
            rows={3}
            className="mt-1"
          />
        </div>
        {isMcq && options.length > 0 ? (
          <div className="space-y-2">
            <Label>Options</Label>
            {options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              return (
                <div key={opt.id ?? `${question.id}-opt-${i}`} className="flex flex-wrap items-center gap-2">
                  <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground">
                    {letter}.
                  </span>
                  <Input
                    value={opt.optionText}
                    onChange={(e) => setOptionText(i, e.target.value)}
                    onBlur={onBlurSave}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant={opt.isCorrect ? "default" : "outline"}
                    onClick={() => {
                      setMcqCorrect(i);
                      onBlurSave();
                    }}
                  >
                    {opt.isCorrect ? "Correct" : "Set correct"}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}
        {isTf ? (
          <div>
            <Label htmlFor={`tf-${question.id}`}>Correct answer</Label>
            <Select
              id={`tf-${question.id}`}
              value={(question.correctAnswer ?? "").toUpperCase()}
              onChange={(e) => {
                setTfCorrect(e.target.value);
                onBlurSave();
              }}
              className="mt-1"
            >
              <option value="">Select</option>
              <option value="TRUE">TRUE</option>
              <option value="FALSE">FALSE</option>
            </Select>
          </div>
        ) : null}
        {question.type === "FILL_IN_THE_BLANK" ? (
          <div>
            <Label htmlFor={`fill-${question.id}`}>Correct answer</Label>
            <Input
              id={`fill-${question.id}`}
              value={question.correctAnswer ?? ""}
              onChange={(e) => onPatch({ correctAnswer: e.target.value })}
              onBlur={onBlurSave}
              className="mt-1"
            />
          </div>
        ) : null}
        {question.type === "SHORT_ANSWER" || question.type === "LONG_ANSWER" ? (
          <div>
            <Label htmlFor={`model-${question.id}`}>Model answer (optional)</Label>
            <Input
              id={`model-${question.id}`}
              value={question.correctAnswer ?? ""}
              onChange={(e) => onPatch({ correctAnswer: e.target.value })}
              onBlur={onBlurSave}
              className="mt-1"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ExamQuestionEditor({
  quizId,
  quiz,
  onChange,
  allowGenerateMore = false,
}: {
  quizId: string;
  quiz: Quiz;
  onChange: (next: Quiz) => void;
  allowGenerateMore?: boolean;
}) {
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [quickGenerate, setQuickGenerate] = useState(true);
  const [mcqCount, setMcqCount] = useState(3);
  const [fillBlankCount, setFillBlankCount] = useState(1);
  const [trueFalseCount, setTrueFalseCount] = useState(1);
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

  const patchQuestion = (questionId: string, patch: Partial<QuizQuestion>) => {
    onChange({
      ...quiz,
      questions: quiz.questions?.map((q) =>
        q.id === questionId ? { ...q, ...patch } : q,
      ),
    });
  };

  const toggleQuestion = (questionId: string) => {
    onChange({
      ...quiz,
      questions: quiz.questions?.map((q) =>
        q.id === questionId ? { ...q, included: !q.included } : q,
      ),
    });
  };

  const persistQuestions = async (nextQuestions: QuizQuestion[]) => {
    setSaving(true);
    try {
      const payload = questionPayloadFromList(nextQuestions);
      const updated = await quizzesService.updateQuestions(quizId, payload, quiz.title);
      onChange(updated);
    } catch (err) {
      toast({
        title: "Could not save changes",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentOrder = () => {
    void persistQuestions(ordered);
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
    void persistQuestions(next);
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

  const generateMore = async () => {
    if (
      !quickGenerate &&
      mcqCount + fillBlankCount + trueFalseCount < 1
    ) {
      toast({
        title: "Choose question counts",
        description: "Enter at least one question type, or use Quick generate.",
        variant: "error",
      });
      return;
    }
    setGeneratingMore(true);
    try {
      const updated = await quizzesService.generateMore(quizId, {
        quickGenerate,
        mcqCount,
        fillBlankCount,
        trueFalseCount,
      });
      onChange(updated);
      toast({
        title: "Questions added",
        description: "New AI questions were appended below your existing ones.",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Could not generate questions",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      });
    } finally {
      setGeneratingMore(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Edit wording directly in each question. Drag to reorder, toggle include/exclude, or add more
        questions below.
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
            className="flex gap-2"
          >
            <button
              type="button"
              className="mt-4 cursor-grab text-muted-foreground active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <DraftQuestionFields
                question={question}
                index={index}
                dimmed={!question.included}
                onPatch={(patch) => patchQuestion(question.id, patch)}
                onBlurSave={saveCurrentOrder}
                action={
                  <Button
                    size="sm"
                    variant={question.included ? "default" : "outline"}
                    onClick={() => {
                      toggleQuestion(question.id);
                      const next = quiz.questions?.map((q) =>
                        q.id === question.id ? { ...q, included: !q.included } : q,
                      );
                      if (next) void persistQuestions(sortQuestions(next));
                    }}
                  >
                    {question.included ? "Included" : "Excluded"}
                  </Button>
                }
              />
            </div>
          </div>
        ))}
      </div>

      {allowGenerateMore ? (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Generate more questions</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Keep your edits and add new AI questions from the same lesson topics.
          </p>
          <QuizMixFields
            quickGenerate={quickGenerate}
            mcqCount={mcqCount}
            fillBlankCount={fillBlankCount}
            trueFalseCount={trueFalseCount}
            onQuickGenerateChange={setQuickGenerate}
            onMcqChange={setMcqCount}
            onFillBlankChange={setFillBlankCount}
            onTrueFalseChange={setTrueFalseCount}
          />
          <Button
            type="button"
            onClick={() => void generateMore()}
            disabled={generatingMore || saving}
          >
            <Sparkles className="h-4 w-4" />
            {generatingMore ? "Generating…" : "Generate more questions"}
          </Button>
          {generatingMore ? <AiWait label="Writing new questions…" /> : null}
        </div>
      ) : null}

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
