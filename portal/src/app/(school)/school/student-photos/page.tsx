"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StudentIdPhotoUpload } from "@/components/students/student-id-photo-upload";
import { studentsService } from "@/services/students.service";
import { ApiClientError, assetUrl } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import { Search } from "lucide-react";

export default function StudentPhotosPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queryReview = useQuery({
    queryKey: ["student-photo-assets"],
    queryFn: studentsService.listPhotoAssets,
    refetchOnWindowFocus: true,
  });

  const students = useQuery({
    queryKey: ["student-photo-search", search],
    queryFn: () => studentsService.list({ search, limit: 20 }),
    enabled: search.length > 0,
  });

  const matches = useMemo(() => students.data?.items ?? [], [students.data]);
  const selectedStudent = useMemo(
    () => matches.find((item) => item.id === selectedId) ?? matches[0] ?? null,
    [matches, selectedId],
  );

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACCEPTED" | "REJECTED" }) =>
      studentsService.reviewPhoto(id, status),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["student-photo-assets"] });
      client.invalidateQueries({ queryKey: ["student-photo-search"] });
      toast({ title: "Photo review saved", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "Could not review photo",
        description: error instanceof ApiClientError ? error.message : "",
        variant: "error",
      }),
  });

  const runSearch = () => {
    const next = query.trim();
    setSearch(next);
    setSelectedId(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Student photos"
        description="Upload ID card photos directly, or accept parent-submitted photos before printing cards."
      />

      <section className="mb-8 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Upload ID card photo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search a student, then upload their portrait photo for ID cards and reports.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <div>
            <Label htmlFor="student-photo-search">Search student</Label>
            <Input
              id="student-photo-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Student ID, name, or parent phone"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={!query.trim() || students.isFetching}>
              <Search className="h-4 w-4" />
              {students.isFetching ? "Searching…" : "Search"}
            </Button>
          </div>
        </form>

        {search && matches.length > 1 ? (
          <div className="mt-4 overflow-hidden rounded-lg border">
            {matches.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted ${
                  (selectedStudent?.id ?? "") === item.id ? "bg-accent" : ""
                }`}
              >
                <span className="font-medium">
                  {item.firstName} {item.lastName}
                </span>
                <span className="text-muted-foreground">{item.studentCode}</span>
              </button>
            ))}
          </div>
        ) : null}

        {search && students.isLoading ? <PageLoader variant="panel" className="mt-4" /> : null}
        {search && students.isFetched && !matches.length ? (
          <p className="mt-4 text-sm text-muted-foreground">No student found for that search.</p>
        ) : null}
        {selectedStudent ? (
          <div className="mt-4 flex flex-wrap items-start gap-6 rounded-lg border bg-muted/20 p-4">
            <div>
              <p className="font-medium">
                {selectedStudent.firstName} {selectedStudent.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{selectedStudent.studentCode}</p>
            </div>
            <StudentIdPhotoUpload
              studentId={selectedStudent.id}
              photoUrl={selectedStudent.photoUrl}
              firstName={selectedStudent.firstName}
              lastName={selectedStudent.lastName}
              invalidateKeys={[["student-photo-search"], ["students-roster"]]}
            />
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Parent submissions awaiting review
        </h2>
        {queryReview.isLoading ? <PageLoader variant="panel" /> : null}
        {queryReview.isError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Could not load pending photos. Refresh the page or sign in again as school admin.
          </p>
        ) : null}
        {!queryReview.isLoading && !queryReview.isError && !queryReview.data?.length ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No photos waiting for review.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {queryReview.data?.map((photo) => {
              const imageUrl = assetUrl(photo.fileAsset.url);
              return (
                <div key={photo.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={`${photo.student.firstName} ${photo.student.lastName}`}
                      className="h-64 w-full object-cover"
                    />
                  ) : null}
                  <div className="space-y-2 p-4">
                    <p className="font-semibold">
                      {photo.student.firstName} {photo.student.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">{photo.student.studentCode}</p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => review.mutate({ id: photo.id, status: "ACCEPTED" })}
                        disabled={review.isPending}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => review.mutate({ id: photo.id, status: "REJECTED" })}
                        disabled={review.isPending}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
