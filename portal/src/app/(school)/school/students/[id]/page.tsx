"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/layout/page-loader";
import { Student360View, type Student360Data } from "@/components/students/student-360-view";
import { insightsService } from "@/services/insights.service";
import { feesService } from "@/services/fees.service";
import { studentsService } from "@/services/students.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

export default function Student360Page() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
        onMarkPaid={(id) => markPaid.mutate(id)}
        markPaidPending={markPaid.isPending}
        onScienceGroupChange={(value) => saveStream.mutate(value)}
        scienceGroupPending={saveStream.isPending}
      />
    </div>
  );
}
