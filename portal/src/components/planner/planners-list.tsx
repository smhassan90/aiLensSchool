"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  academicPlannerService,
  type PlannerListItem,
} from "@/services/academic-planner.service";
import { formatStatusLabel, friendlyApiErrorMessage } from "@/lib/display-labels";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

type PlannersListProps = {
  planners: PlannerListItem[];
  plannerHref: (row: PlannerListItem) => string;
  allowDelete?: boolean;
};

export function PlannersList({ planners, plannerHref, allowDelete = true }: PlannersListProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<PlannerListItem | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => academicPlannerService.archive(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["planners"] });
      toast({ title: "Planner deleted", variant: "success" });
      setPendingDelete(null);
    },
    onError: (err) => {
      toast({
        title: "Could not delete planner",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    },
  });

  const openPlanner = (row: PlannerListItem) => {
    router.push(plannerHref(row));
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Class</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead>Exam</TableHead>
            <TableHead>Status</TableHead>
            {allowDelete && <TableHead className="w-[88px] text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {planners.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => openPlanner(row)}
            >
              <TableCell className="font-medium">{row.classLabel || row.title}</TableCell>
              <TableCell>{row.subjectName}</TableCell>
              <TableCell>{row.teacherName}</TableCell>
              <TableCell>{formatDate(row.examDate)}</TableCell>
              <TableCell>{formatStatusLabel(row.workingVersionStatus ?? row.status)}</TableCell>
              {allowDelete && (
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(row);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Delete</span>
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this planner?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${pendingDelete.classLabel} · ${pendingDelete.subjectName} will be removed from your list. Teaching records already linked are not erased, but you will no longer open this plan in the workspace.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending || !pendingDelete}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              {remove.isPending ? "Deleting…" : "Delete planner"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function plannerDetailHref(basePath: string, row: PlannerListItem): string {
  const v = row.workingVersionId;
  return v ? `${basePath}/${row.id}?v=${encodeURIComponent(v)}` : `${basePath}/${row.id}`;
}
