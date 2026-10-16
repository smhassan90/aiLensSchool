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
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [editionYear, setEditionYear] = useState("");

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chapters ({data.chapters.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.chapters.map((chapter) => (
            <div key={chapter.id} className="flex justify-between gap-4 border-b py-2">
              <span>
                {chapter.chapterNumber != null ? `${chapter.chapterNumber}. ` : ""}
                {chapter.title}
              </span>
              <span className="text-muted-foreground">{chapter.textLength.toLocaleString()} characters</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
