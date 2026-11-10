"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  academicsService,
  type GrantedLibraryBookBrief,
  type SubjectTextbookRow,
} from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

function norm(s: string) {
  return s.trim().toLowerCase();
}

function booksForSubject(
  subjectName: string,
  gradeName: string,
  grantedBooks: GrantedLibraryBookBrief[],
) {
  const sub = norm(subjectName);
  const grade = norm(gradeName);
  const ranked = grantedBooks.map((book) => {
    const subjectMatch =
      norm(book.subjectLabel).includes(sub) || sub.includes(norm(book.subjectLabel));
    const classMatch =
      norm(book.classLabel).includes(grade) ||
      grade.includes(norm(book.classLabel)) ||
      /\b10\b/.test(grade) && /class\s*x|grade\s*10/i.test(book.classLabel);
    const score = (subjectMatch ? 4 : 0) + (classMatch ? 2 : 0);
    return { book, score };
  });
  ranked.sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title));
  const ordered = ranked.map((r) => r.book);
  const seen = new Set(ordered.map((b) => b.id));
  for (const book of grantedBooks) {
    if (!seen.has(book.id)) ordered.push(book);
  }
  return ordered;
}

export default function TextbookSetupPage() {
  const [gradeId, setGradeId] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const grades = useQuery({
    queryKey: ["grades"],
    queryFn: () => academicsService.listGrades({ limit: 100 }),
  });

  const setup = useQuery({
    queryKey: ["grade-textbooks", gradeId],
    queryFn: () => academicsService.getGradeTextbooks(gradeId),
    enabled: Boolean(gradeId),
  });

  const save = useMutation({
    mutationFn: ({ subjectId, libraryBookId }: { subjectId: string; libraryBookId: string | null }) =>
      academicsService.assignSubjectTextbook(subjectId, libraryBookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grade-textbooks", gradeId] });
      toast({ title: "Textbook saved", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not save textbook",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const sortedGrades = useMemo(
    () =>
      [...(grades.data?.items ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      ),
    [grades.data?.items],
  );

  const assignedCount = setup.data?.subjects.filter((s) => s.libraryBookId).length ?? 0;
  const subjectTotal = setup.data?.subjects.length ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Class textbooks"
        description="Choose which shared library book each subject uses — e.g. pick the correct English book when several Class 10 English titles are granted."
        actions={
          <Link href="/school/setup">
            <Button variant="outline" size="sm">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Setup
            </Button>
          </Link>
        }
      />

      <div className="mb-6 max-w-md space-y-2">
        <Label htmlFor="gradeId">Class</Label>
        <Select
          id="gradeId"
          value={gradeId}
          onChange={(e) => setGradeId(e.target.value)}
          disabled={grades.isLoading}
        >
          <option value="">Select a class…</option>
          {sortedGrades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Applies to all sections of this class. Academic planners pre-select these books.
        </p>
      </div>

      {!gradeId ? (
        <EmptyState
          icon={<BookMarked className="h-10 w-10" />}
          title="Pick a class"
          description="Then match each subject to one library book shared with your school."
        />
      ) : setup.isLoading ? (
        <PageLoader variant="panel" />
      ) : !setup.data?.subjects.length ? (
        <EmptyState
          icon={<BookMarked className="h-10 w-10" />}
          title="No subjects for this class"
          description="Add subjects under Setup → Subjects and link them to this class."
          action={
            <Link href="/school/academics/subjects">
              <Button>Go to subjects</Button>
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {assignedCount} of {subjectTotal} subjects have a textbook assigned.
            {!setup.data.grantedBooks.length ? (
              <span className="text-amber-700 dark:text-amber-400">
                {" "}
                No library books are granted yet — ask your super admin to share books with your school.
              </span>
            ) : null}
          </p>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="min-w-[280px]">Library book</TableHead>
                  <TableHead>Publisher</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {setup.data.subjects.map((subject) => (
                  <SubjectTextbookRowEditor
                    key={subject.id}
                    subject={subject}
                    gradeName={setup.data.grade.name}
                    grantedBooks={setup.data.grantedBooks}
                    disabled={save.isPending}
                    onSave={(libraryBookId) =>
                      save.mutate({ subjectId: subject.id, libraryBookId })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function SubjectTextbookRowEditor({
  subject,
  gradeName,
  grantedBooks,
  disabled,
  onSave,
}: {
  subject: SubjectTextbookRow & { libraryBookId?: string | null };
  gradeName: string;
  grantedBooks: GrantedLibraryBookBrief[];
  disabled: boolean;
  onSave: (libraryBookId: string | null) => void;
}) {
  const options = useMemo(
    () => booksForSubject(subject.name, gradeName, grantedBooks),
    [subject.name, gradeName, grantedBooks],
  );
  const value = subject.libraryBook?.id ?? subject.libraryBookId ?? "";

  return (
    <TableRow>
      <TableCell className="font-medium">
        {subject.name}
        <span className="ml-2 text-xs text-muted-foreground">{subject.code}</span>
      </TableCell>
      <TableCell>
        <Select
          value={value}
          disabled={disabled || !grantedBooks.length}
          onChange={(e) => {
            const next = e.target.value || null;
            onSave(next);
          }}
        >
          <option value="">Not assigned</option>
          {options.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
              {book.classLabel || book.subjectLabel
                ? ` · ${[book.classLabel, book.subjectLabel].filter(Boolean).join(" · ")}`
                : ""}
            </option>
          ))}
          {value && !options.some((b) => b.id === value) ? (
            <option value={value}>{subject.libraryBook?.title ?? "Assigned book"}</option>
          ) : null}
        </Select>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {subject.libraryBook?.publisher || "—"}
      </TableCell>
    </TableRow>
  );
}
