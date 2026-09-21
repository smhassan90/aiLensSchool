"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/layout/page-loader";
import { Student360View, type Student360Data } from "@/components/students/student-360-view";
import { insightsService } from "@/services/insights.service";
import { feesService } from "@/services/fees.service";
import { studentsService } from "@/services/students.service";
import { parentsService } from "@/services/parents.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

type ParentPasswordReset = {
  username: string | null;
  temporaryPassword: string;
};

export default function Student360Page() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [parentPasswordReset, setParentPasswordReset] = useState<ParentPasswordReset | null>(null);
  const query = useQuery({
    queryKey: ["student-360", params.id],
    queryFn: () => insightsService.student(params.id) as Promise<Student360Data>,
  });
  const markPaid = useMutation({
    mutationFn: (studentFeeId: string) => feesService.markPaid(studentFeeId),
    onSuccess: () => {
      toast({ title: "Marked as paid", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["student-360", params.id] });
      queryClient.invalidateQueries({ queryKey: ["fees"] });
    },
    onError: (err) =>
      toast({
        title: "Could not mark paid",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });
  const saveStream = useMutation({
    mutationFn: (scienceGroup: string) =>
      studentsService.update(params.id, { scienceGroup: scienceGroup || null }),
    onSuccess: () => {
      toast({ title: "Science group saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["student-360", params.id] });
    },
    onError: (err) =>
      toast({
        title: "Could not save",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });
  const resetParentPassword = useMutation({
    mutationFn: (parentProfileId: string) => parentsService.resetPassword(parentProfileId),
    onSuccess: (result) => {
      setParentPasswordReset({
        username: result.username,
        temporaryPassword: result.temporaryPassword,
      });
      toast({
        title: "Parent password reset",
        description: "Share the temporary password securely with the parent.",
        variant: "success",
      });
    },
    onError: (err) =>
      toast({
        title: "Could not reset parent password",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  if (query.isLoading) {
    return <PageLoader variant="page" />;
  }
  if (!query.data) {
    return <div className="p-4 sm:p-6 lg:p-8">Student not found.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Student360View
        data={query.data}
        studentId={params.id}
        backHref="/school/students"
        backLabel="All students"
        allowPhotoUpload
        onMarkPaid={(id) => markPaid.mutate(id)}
        markPaidPending={markPaid.isPending}
        onScienceGroupChange={(value) => saveStream.mutate(value)}
        scienceGroupPending={saveStream.isPending}
        onResetParentPassword={(parentProfileId) => resetParentPassword.mutate(parentProfileId)}
        resetParentPasswordPending={resetParentPassword.isPending}
        parentPasswordReset={parentPasswordReset}
      />
    </div>
  );
}
