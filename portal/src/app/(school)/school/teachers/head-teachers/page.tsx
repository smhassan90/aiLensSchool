"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { HeadTeacherBoardEditor } from "@/components/head-teachers/head-teacher-board";
import { headTeachersService } from "@/services/head-teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

export default function HeadTeachersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const board = useQuery({
    queryKey: ["head-teacher-board"],
    queryFn: () => headTeachersService.getBoard(),
  });

  const save = useMutation({
    mutationFn: (assignments: Array<{ teacherId: string; title: string; sectionIds: string[] }>) =>
      headTeachersService.saveBoard(assignments),
    onSuccess: (data) => {
      queryClient.setQueryData(["head-teacher-board"], data);
      toast({ title: "Head teachers saved", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "Could not save head teachers",
        description: error instanceof ApiClientError ? error.message : "Unexpected error",
        variant: "error",
      }),
  });

  if (board.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Head teachers" />
        <PageLoader variant="page" />
      </div>
    );
  }

  if (board.isError || !board.data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Head teachers" />
        <p className="text-sm text-destructive">{(board.error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Head teachers"
        description="Choose a teacher, set their head-teacher title, and drag classes under them."
        actions={
          <Link href="/school/teachers">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to teachers
            </Button>
          </Link>
        }
      />
      <HeadTeacherBoardEditor
        board={board.data}
        saving={save.isPending}
        onSave={(assignments) => save.mutate(assignments)}
      />
    </div>
  );
}
