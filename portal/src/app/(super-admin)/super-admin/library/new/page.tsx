"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { libraryBooksService } from "@/services/library-books.service";
import { useToast } from "@/providers/toast-provider";
import { ArrowLeft } from "lucide-react";

export default function NewLibraryBookPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [editionYear, setEditionYear] = useState("");

  const create = useMutation({
    mutationFn: () =>
      libraryBooksService.create({
        title: title.trim(),
        publisher: publisher.trim(),
        classLabel: classLabel.trim(),
        subjectLabel: subjectLabel.trim(),
        editionYear: editionYear.trim(),
      }),
    onSuccess: (book) => {
      toast({ title: "Book added", variant: "success" });
      router.push(`/super-admin/library/${book.id}`);
    },
    onError: (err) => toast({ title: "Could not add book", description: (err as Error).message, variant: "error" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Add book"
        description="The book stays empty until chapters are added. Assign it to a school from the next screen."
        actions={
          <Link href="/super-admin/library">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Library
            </Button>
          </Link>
        }
      />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Book name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mathematics for Class X" />
          </div>
          <div className="space-y-2">
            <Label>Publisher</Label>
            <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Edition year</Label>
            <Input value={editionYear} onChange={(e) => setEditionYear(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Class</Label>
            <Input value={classLabel} onChange={(e) => setClassLabel(e.target.value)} placeholder="Class X" />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subjectLabel} onChange={(e) => setSubjectLabel(e.target.value)} placeholder="Mathematics" />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Saving…" : "Save book"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
