"use client";

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ExamDateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examDate: string;
  onExamDateChange: (value: string) => void;
  onConfirm: () => void;
  isPending?: boolean;
  examName?: string;
};

export function ExamDateDialog({
  open,
  onOpenChange,
  examDate,
  onExamDateChange,
  onConfirm,
  isPending,
  examName,
}: ExamDateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-primary/20 p-0" onClose={() => onOpenChange(false)}>
        <div className="border-b bg-primary/5 px-5 py-4">
          <DialogHeader className="mb-0 space-y-2 text-left">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Calendar className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-base">Set exam date</DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  {examName
                    ? `Choose the exam date for “${examName}” before printing. It will appear on the paper.`
                    : "Choose the exam date before printing. It will appear on the paper."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="exam-date">Exam date</Label>
            <Input
              id="exam-date"
              type="date"
              value={examDate}
              onChange={(e) => onExamDateChange(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!examDate || isPending} onClick={onConfirm}>
              {isPending ? "Saving…" : "Save & print"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
