"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type QuizMixFieldsProps = {
  quickGenerate: boolean;
  mcqCount: number;
  fillBlankCount: number;
  trueFalseCount: number;
  onQuickGenerateChange: (value: boolean) => void;
  onMcqChange: (value: number) => void;
  onFillBlankChange: (value: number) => void;
  onTrueFalseChange: (value: number) => void;
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
  trueFalseCount,
  onQuickGenerateChange,
  onMcqChange,
  onFillBlankChange,
  onTrueFalseChange,
}: QuizMixFieldsProps) {
  const total = mcqCount + fillBlankCount + trueFalseCount;

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
          AI will pick a mix of choose-the-best-answer, fill in the blanks, and true/false — all auto-marked.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            <CountField id="mcqCount" label="Choose the best answer" value={mcqCount} onChange={onMcqChange} />
            <CountField id="fillBlankCount" label="Fill in the blanks" value={fillBlankCount} onChange={onFillBlankChange} />
            <CountField id="trueFalseCount" label="True / False" value={trueFalseCount} onChange={onTrueFalseChange} />
          </div>
          <p className="text-xs text-muted-foreground">
            {total} question{total === 1 ? "" : "s"} total. Enter at least one. Open-ended essays are not used; fill-in-the-blank answers must be a short exact word or phrase.
          </p>
        </>
      )}
    </div>
  );
}
