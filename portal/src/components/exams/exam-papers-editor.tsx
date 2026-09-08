"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXAM_PATTERN_OPTIONS,
  EXAM_PATTERN_PAPERS,
  createDraftPaper,
  draftsFromPapers,
  insertIndexForAssessment,
  isFinalTerm,
  isMidTerm,
  nextAssessmentName,
  type DraftExamPaper,
  type ExamPatternId,
} from "@/lib/exam-patterns";

type ExamPapersEditorProps = {
  papers: DraftExamPaper[];
  onChange: (papers: DraftExamPaper[]) => void;
};

export function ExamPapersEditor({ papers, onChange }: ExamPapersEditorProps) {
  const hasMid = papers.some((paper) => isMidTerm(paper.name));
  const hasFinal = papers.some((paper) => isFinalTerm(paper.name));

  const update = (index: number, patch: Partial<DraftExamPaper>) => {
    onChange(papers.map((paper, i) => (i === index ? { ...paper, ...patch } : paper)));
  };

  const insertAt = (index: number, paper: DraftExamPaper) => {
    const next = [...papers];
    next.splice(index, 0, paper);
    onChange(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= papers.length) return;
    const next = [...papers];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  const remove = (index: number) => {
    if (papers.length <= 1) return;
    onChange(papers.filter((_, i) => i !== index));
  };

  const addAssessment = (index?: number) => {
    insertAt(
      index ?? insertIndexForAssessment(papers),
      createDraftPaper(nextAssessmentName(papers), 50),
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Start from a template (optional)</Label>
        <select
          className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
          defaultValue=""
          onChange={(e) => {
            const value = e.target.value as Exclude<ExamPatternId, "CUSTOM"> | "";
            if (!value) return;
            onChange(draftsFromPapers(EXAM_PATTERN_PAPERS[value]));
            e.target.value = "";
          }}
        >
          <option value="">Keep current list — or pick a starter</option>
          {EXAM_PATTERN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted-foreground">
        Add papers in any order, set max marks, and optionally the date range for each exam. Every school keeps its own schedule.
      </p>

      <ol className="space-y-2">
        {papers.map((paper, index) => (
          <li key={paper.key}>
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex h-10 w-8 shrink-0 items-center justify-center text-sm font-medium text-muted-foreground">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <Label>Paper name</Label>
                  <Input
                    value={paper.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                    placeholder="1st Assessment"
                    required
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Label>Max marks</Label>
                  <Input
                    type="number"
                    min={1}
                    value={paper.maxMarks}
                    onChange={(e) => update(index, { maxMarks: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="icon" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => move(index, 1)}
                    disabled={index === papers.length - 1}
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => remove(index)}
                    disabled={papers.length <= 1}
                    aria-label="Remove paper"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 sm:pl-10">
                <div>
                  <Label>Starts (optional)</Label>
                  <Input
                    type="date"
                    value={paper.startDate ?? ""}
                    onChange={(e) => update(index, { startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ends (optional)</Label>
                  <Input
                    type="date"
                    value={paper.endDate ?? ""}
                    onChange={(e) => update(index, { endDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
            {index < papers.length - 1 && (
              <div className="flex justify-center py-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => addAssessment(index + 1)}>
                  <Plus className="h-4 w-4" />
                  Insert assessment
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addAssessment()}>
          <Plus className="h-4 w-4" />
          Add assessment
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={hasMid}
          onClick={() => insertAt(insertIndexForAssessment(papers), createDraftPaper("Mid term", 50))}
        >
          <Plus className="h-4 w-4" />
          Add mid term
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={hasFinal}
          onClick={() => insertAt(papers.length, createDraftPaper("Final Term", 100))}
        >
          <Plus className="h-4 w-4" />
          Add final term
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => insertAt(papers.length, createDraftPaper("Paper", 50))}
        >
          <Plus className="h-4 w-4" />
          Add custom paper
        </Button>
      </div>
    </div>
  );
}
