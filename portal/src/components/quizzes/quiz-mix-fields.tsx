"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type QuizMixFieldsProps = {
  quickGenerate: boolean;
  mcqCount: number;
  fillBlankCount: number;
  shortAnswerCount: number;
  onQuickGenerateChange: (value: boolean) => void;
  onMcqChange: (value: number) => void;
  onFillBlankChange: (value: number) => void;
  onShortAnswerChange: (value: number) => void;
};

function CountField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={20}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </div>
  );
}

export function QuizMixFields({
  quickGenerate,
  mcqCount,
  fillBlankCount,
  shortAnswerCount,
  onQuickGenerateChange,
  onMcqChange,
  onFillBlankChange,
  onShortAnswerChange,
}: QuizMixFieldsProps) {
  const total = mcqCount + fillBlankCount + shortAnswerCount;

  return (
    <div className="space-y-3">
      <Label>Question types</Label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={quickGenerate ? "default" : "outline"}
          onClick={() => onQuickGenerateChange(true)}
        >
          Quick generate
        </Button>
        <Button
          type="button"
          variant={!quickGenerate ? "default" : "outline"}
          onClick={() => onQuickGenerateChange(false)}
        >
          Choose counts
        </Button>
      </div>
      {quickGenerate ? (
        <p className="text-sm text-muted-foreground">
          AI will pick a mix of choose-the-best-answer, fill in the blanks, and simple text.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            <CountField id="mcqCount" label="Choose the best answer" value={mcqCount} onChange={onMcqChange} />
            <CountField id="fillBlankCount" label="Fill in the blanks" value={fillBlankCount} onChange={onFillBlankChange} />
            <CountField id="shortAnswerCount" label="Simple text" value={shortAnswerCount} onChange={onShortAnswerChange} />
          </div>
          <p className="text-xs text-muted-foreground">
            {total} question{total === 1 ? "" : "s"} total. Enter at least one.
          </p>
        </>
      )}
    </div>
  );
}
