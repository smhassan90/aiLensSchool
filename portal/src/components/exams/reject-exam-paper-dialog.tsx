"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RejectExamPaperDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  isPending?: boolean;
  paperTitle?: string;
};

export function RejectExamPaperDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  onConfirm,
  isPending,
  paperTitle,
}: RejectExamPaperDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-amber-200/80 p-0" onClose={() => onOpenChange(false)}>
        <div className="border-b bg-amber-50/80 px-5 py-4">
          <DialogHeader className="mb-0 space-y-2 text-left">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-base">Reject exam paper</DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  {paperTitle
                    ? `Tell the teacher what to fix on “${paperTitle}”.`
                    : "Tell the teacher what to fix. The paper returns to draft for revision."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Feedback for teacher</Label>
            <textarea
              id="reject-reason"
              rows={4}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="e.g. Section B marks do not add up to the total. Please revise and resubmit."
              className="min-h-[6rem] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!reason.trim() || isPending}
              onClick={onConfirm}
            >
              {isPending ? "Rejecting…" : "Reject paper"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
