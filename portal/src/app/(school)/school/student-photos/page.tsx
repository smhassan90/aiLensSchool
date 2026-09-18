"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { studentsService } from "@/services/students.service";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";

export default function StudentPhotosPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({ queryKey: ["student-photo-assets"], queryFn: studentsService.listPhotoAssets });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACCEPTED" | "REJECTED" }) =>
      studentsService.reviewPhoto(id, status),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["student-photo-assets"] });
      toast({ title: "Photo review saved", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "Could not review photo",
        description: error instanceof ApiClientError ? error.message : "",
        variant: "error",
      }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Student photos" description="Accept or discard parent-uploaded photos before using them on cards and reports." />
      {query.isLoading ? <PageLoader variant="panel" /> : null}
      {!query.isLoading && !query.data?.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No photos waiting for review.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data?.map((photo) => (
            <div key={photo.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              {photo.fileAsset.url ? (
                <img src={photo.fileAsset.url} alt={`${photo.student.firstName} ${photo.student.lastName}`} className="h-64 w-full object-cover" />
              ) : null}
              <div className="space-y-2 p-4">
                <p className="font-semibold">{photo.student.firstName} {photo.student.lastName}</p>
                <p className="text-sm text-muted-foreground">{photo.student.studentCode}</p>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => review.mutate({ id: photo.id, status: "ACCEPTED" })} disabled={review.isPending}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => review.mutate({ id: photo.id, status: "REJECTED" })} disabled={review.isPending}>
                    Discard
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
