"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

type ExamDeadlineRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  dueDate?: string | null;
  days: "1" | "2" | "3";
  onDaysChange: (value: "1" | "2" | "3") => void;
  onConfirm: () => void;
  isPending?: boolean;
  pendingRequest?: { days: number } | null;
  kind: "paper" | "score";
};

export function ExamDeadlineRequestDialog({
  open,
  onOpenChange,
  title,
  description,
  dueDate,
  days,
  onDaysChange,
  onConfirm,
  isPending,
  pendingRequest,
  kind,
}: ExamDeadlineRequestDialogProps) {
  const kindLabel = kind === "paper" ? "exam paper submission" : "score entry";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-rose-200/80 p-0" onClose={() => onOpenChange(false)}>
        <div className="border-b bg-rose-50/80 px-5 py-4">
          <DialogHeader className="mb-0 space-y-2 text-left">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-800">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-base">{title}</DialogTitle>
                <DialogDescription className="mt-1 text-sm">{description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-5 py-5">
          {dueDate ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
              The {kindLabel} due date was {formatDate(dueDate)}. Request the office to reopen access.
            </p>
          ) : null}

          {pendingRequest ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Your request for {pendingRequest.days} day{pendingRequest.days === 1 ? "" : "s"} is pending with the office.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>How many days do you need?</Label>
                <Select value={days} onChange={(e) => onDaysChange(e.target.value as "1" | "2" | "3")}>
                  <option value="1">1 day</option>
                  <option value="2">2 days</option>
                  <option value="3">3 days</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={isPending} onClick={onConfirm}>
                  {isPending ? "Sending…" : "Request admin"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
