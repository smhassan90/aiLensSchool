"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { libraryBooksService } from "@/services/library-books.service";
import { schoolsService } from "@/services/schools.service";
import { useToast } from "@/providers/toast-provider";
import { ArrowLeft } from "lucide-react";

export default function LibraryBookPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["library-book", id],
    queryFn: () => libraryBooksService.get(id),
  });
  const schools = useQuery({
    queryKey: ["schools", "library-assign"],
    queryFn: () => schoolsService.list({ limit: 100 }),
  });
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [editionYear, setEditionYear] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [rights, setRights] = useState({ canRead: true, canWrite: false, canUpdate: false, canDelete: false });

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setPublisher(data.publisher);
    setClassLabel(data.classLabel);
    setSubjectLabel(data.subjectLabel);
    setEditionYear(data.editionYear ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      libraryBooksService.update(id, {
        title: title.trim(),
        publisher: publisher.trim(),
        classLabel: classLabel.trim(),
        subjectLabel: subjectLabel.trim(),
        editionYear: editionYear.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library-book", id] });
      queryClient.invalidateQueries({ queryKey: ["library-books"] });
      toast({ title: "Book updated", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not save", description: (err as Error).message, variant: "error" }),
  });

  const grant = useMutation({
    mutationFn: (body?: typeof rights & { schoolId: string }) =>
      libraryBooksService.grant(id, body ?? { schoolId, ...rights }),
    onSuccess: () => {
      setSchoolId("");
      setRights({ canRead: true, canWrite: false, canUpdate: false, canDelete: false });
      queryClient.invalidateQueries({ queryKey: ["library-book", id] });
      queryClient.invalidateQueries({ queryKey: ["library-books"] });
      toast({ title: "School assigned", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not assign", description: (err as Error).message, variant: "error" }),
  });

  const revoke = useMutation({
    mutationFn: (targetSchoolId: string) => libraryBooksService.revoke(id, targetSchoolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library-book", id] });
      queryClient.invalidateQueries({ queryKey: ["library-books"] });
      toast({
        title: "School unassigned",
        description: "New quizzes, homework, and exam papers from this book are blocked. Papers already created stay.",
        variant: "success",
      });
    },
    onError: (err) => toast({ title: "Could not unassign", description: (err as Error).message, variant: "error" }),
  });

  const assignedIds = new Set(data?.grants.map((grant) => grant.schoolId) ?? []);

  if (isLoading || !data) return <PageLoader variant="page" />;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={data.title}
        description="Publisher and class labels are filled here. Chapter text stays shared."
        actions={
          <Link href="/super-admin/library">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Library
            </Button>
          </Link>
        }
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Book details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Book name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Publisher</Label>
            <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="Sindh Textbook Board" />
          </div>
          <div className="space-y-2">
            <Label>Edition year</Label>
            <Input value={editionYear} onChange={(e) => setEditionYear(e.target.value)} placeholder="2024" />
          </div>
          <div className="space-y-2">
            <Label>Class</Label>
            <Input value={classLabel} onChange={(e) => setClassLabel(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subjectLabel} onChange={(e) => setSubjectLabel(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Schools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Unassigning stops new quizzes, homework, and exam papers from this book. Papers already generated remain.
          </p>
          {data.grants.length ? (
            <ul className="space-y-2 text-sm">
              {data.grants.map((grantRow) => (
                <li key={grantRow.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2">
                  <span className="font-medium">{grantRow.school.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      grantRow.canRead ? "Read" : null,
                      grantRow.canWrite ? "Write" : null,
                      grantRow.canUpdate ? "Update" : null,
                      grantRow.canDelete ? "Delete" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No rights"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(grantRow.schoolId)}
                  >
                    Unassign
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No school is assigned yet.</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1 space-y-2">
              <Label>Assign to school</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
              >
                <option value="">Select a school</option>
                {schools.data?.items
                  .filter((school) => !assignedIds.has(school.id))
                  .map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              type="button"
              disabled={!schoolId || grant.isPending}
              onClick={() => grant.mutate({ schoolId, ...rights })}
            >
              {grant.isPending ? "Assigning…" : "Assign"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <RightCheck label="Read book" checked={rights.canRead} onChange={(canRead) => setRights((r) => ({ ...r, canRead }))} />
            <RightCheck label="Write book" checked={rights.canWrite} onChange={(canWrite) => setRights((r) => ({ ...r, canWrite }))} />
            <RightCheck label="Update book" checked={rights.canUpdate} onChange={(canUpdate) => setRights((r) => ({ ...r, canUpdate }))} />
            <RightCheck label="Delete book" checked={rights.canDelete} onChange={(canDelete) => setRights((r) => ({ ...r, canDelete }))} />
          </div>
          <p className="text-xs text-muted-foreground">
            Read lets the school use the book for lessons, quizzes, homework, and exam papers. Write, update, and delete let the school admin add, change, or remove chapters. Deleting the book for every school stays with the super admin.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chapters ({data.chapters.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.chapters.map((chapter) => (
            <div key={chapter.id} className="flex justify-between gap-4 border-b py-2">
              <span>
                <span className="font-medium">
                  {chapter.chapterNumber != null ? `${chapter.chapterNumber}. ` : ""}
                  {chapter.title}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {chapter.uploadedBy
                    ? `${chapter.uploadedBy.firstName} ${chapter.uploadedBy.lastName}`.trim()
                    : "Unknown"}
                  {chapter.uploadedBySchool?.name ? ` · ${chapter.uploadedBySchool.name}` : ""}
                </span>
              </span>
              <span className="text-muted-foreground">{chapter.textLength.toLocaleString()} characters</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RightCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
