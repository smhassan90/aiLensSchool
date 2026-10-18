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
import { ArrowLeft, School } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LIBRARY_CLASSES, LIBRARY_LANGUAGES, LIBRARY_SUBJECTS, optionsWithCurrent } from "@/lib/library-book-options";

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
  const [language, setLanguage] = useState("English");
  const [editionYear, setEditionYear] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [rights, setRights] = useState({ canRead: true, canWrite: false, canUpdate: false, canDelete: false });

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setPublisher(data.publisher);
    setClassLabel(data.classLabel);
    setSubjectLabel(data.subjectLabel);
    setLanguage(data.language || "English");
    setEditionYear(data.editionYear ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      libraryBooksService.update(id, {
        title: title.trim(),
        publisher: publisher.trim(),
        classLabel: classLabel.trim(),
        subjectLabel: subjectLabel.trim(),
        language,
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
      setRevokeTarget(null);
    },
    onError: (err) => toast({ title: "Could not unassign", description: (err as Error).message, variant: "error" }),
  });

  const assignedIds = new Set(data?.grants?.map((grant) => grant.schoolId) ?? []);

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
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={classLabel} onChange={(e) => setClassLabel(e.target.value)}>
              <option value="">Select a class</option>
              {optionsWithCurrent(LIBRARY_CLASSES, classLabel).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={subjectLabel} onChange={(e) => setSubjectLabel(e.target.value)}>
              <option value="">Select a subject</option>
              {optionsWithCurrent(LIBRARY_SUBJECTS, subjectLabel).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LIBRARY_LANGUAGES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
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
          <CardTitle className="text-base">Assign to schools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            A school can use this book only while it is assigned. Unassigning blocks new quizzes, homework, and exam papers. Papers already created stay.
          </p>
          {(data.grants ?? []).length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {(data.grants ?? []).map((grantRow) => (
                <li key={grantRow.id} className="flex items-start justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                  <div>
                    <p className="font-medium">{grantRow.school.name}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {grantRow.canRead ? <Badge variant="success">Read</Badge> : null}
                      {grantRow.canWrite ? <Badge>Write</Badge> : null}
                      {grantRow.canUpdate ? <Badge variant="warning">Update</Badge> : null}
                      {grantRow.canDelete ? <Badge variant="destructive">Delete</Badge> : null}
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRevokeTarget({ id: grantRow.schoolId, name: grantRow.school.name })}>
                    Unassign
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              <School className="mx-auto mb-2 h-6 w-6" />
              No school is assigned yet.
            </div>
          )}
          <div className="rounded-xl border bg-background p-4">
            <p className="mb-3 text-sm font-medium">Assign another school</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[16rem] flex-1 space-y-2">
                <Label>School</Label>
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
              <Button type="button" disabled={!schoolId || grant.isPending} onClick={() => grant.mutate({ schoolId, ...rights })}>
                {grant.isPending ? "Assigning…" : "Assign school"}
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <RightCheck label="Read" checked={rights.canRead} onChange={(canRead) => setRights((r) => ({ ...r, canRead }))} />
              <RightCheck label="Write" checked={rights.canWrite} onChange={(canWrite) => setRights((r) => ({ ...r, canWrite }))} />
              <RightCheck label="Update" checked={rights.canUpdate} onChange={(canUpdate) => setRights((r) => ({ ...r, canUpdate }))} />
              <RightCheck label="Delete" checked={rights.canDelete} onChange={(canDelete) => setRights((r) => ({ ...r, canDelete }))} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Read lets the school teach from this book. Write, update, and delete let that school change lectures. Removing the book for every school stays with the super admin.
            </p>
          </div>
        </CardContent>
      </Card>
      <Dialog open={Boolean(revokeTarget)} onOpenChange={(next) => !next && setRevokeTarget(null)}>
        <DialogContent onClose={() => setRevokeTarget(null)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unassign {revokeTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground">
            New quizzes, homework, and exam papers from this book will be blocked. Papers already created stay.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={revoke.isPending} onClick={() => revokeTarget && revoke.mutate(revokeTarget.id)}>
              {revoke.isPending ? "Unassigning…" : "Unassign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chapters ({(data.chapters ?? []).length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data.chapters ?? []).map((chapter) => (
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
              <span className="text-muted-foreground">
                {(chapter.textLength ?? 0).toLocaleString()} characters
              </span>
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
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-sm",
        checked ? "border-primary bg-primary/10 text-primary" : "bg-background",
      )}
    >
      {label}
    </button>
  );
}
