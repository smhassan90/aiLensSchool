"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { libraryBooksService, type LibraryBookListItem, type LibraryChapter } from "@/services/library-books.service";
import { personFullName } from "@/lib/person-name";
import { useToast } from "@/providers/toast-provider";
import { ChevronDown, Library } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LibraryBooksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploadingBookId, setUploadingBookId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<LibraryChapter | null>(null);
  const [editorMode, setEditorMode] = useState<"edit" | "reupload" | null>(null);
  const [chapterName, setChapterName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [draft, setDraft] = useState("");
  const [exercises, setExercises] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("");
  const [uploaderFilter, setUploaderFilter] = useState("");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["library-books"],
    queryFn: () => libraryBooksService.list(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["library-books"] });

  const removeBook = useMutation({
    mutationFn: (id: string) => libraryBooksService.remove(id),
    onSuccess: () => {
      refresh();
      toast({ title: "Book deleted", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not delete book", description: (err as Error).message, variant: "error" }),
  });

  const addChapter = useMutation({
    mutationFn: () => {
      if (!uploadingBookId) throw new Error("Choose a book");
      return libraryBooksService.addChapter(uploadingBookId, {
        title: chapterName.trim(),
        topicName: topicName.trim(),
        publishedText: draft.trim(),
        exercisesText: exercises.trim(),
      });
    },
    onSuccess: () => {
      setUploadingBookId(null);
      setChapterName("");
      setTopicName("");
      setDraft("");
      setExercises("");
      refresh();
      toast({ title: "Lecture uploaded", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not upload lecture", description: (err as Error).message, variant: "error" }),
  });

  const removeChapter = useMutation({
    mutationFn: (input: { bookId: string; chapterId: string }) =>
      libraryBooksService.removeChapter(input.bookId, input.chapterId),
    onSuccess: () => {
      refresh();
      toast({ title: "Chapter deleted", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not delete chapter", description: (err as Error).message, variant: "error" }),
  });

  const openEditor = async (bookId: string, chapter: LibraryChapter, mode: "edit" | "reupload") => {
    setOpenId(bookId);
    setReplacing(chapter);
    setEditorMode(mode);
    setChapterName(chapter.title);
    setTopicName(chapter.topicName || "");
    setDraft("");
    setExercises("");
    try {
      const full = await libraryBooksService.getChapter(bookId, chapter.id);
      setChapterName(full.title);
      setTopicName(full.topicName || "");
      setDraft(mode === "reupload" ? "" : full.publishedText);
      setExercises(mode === "reupload" ? "" : full.exercisesText || "");
    } catch (err) {
      toast({ title: "Could not open chapter", description: (err as Error).message, variant: "error" });
    }
  };

  const replaceChapter = useMutation({
    mutationFn: () => {
      if (!replacing || !openId) throw new Error("Choose a chapter");
      return libraryBooksService.replaceChapter(openId, replacing.id, {
        title: chapterName.trim(),
        topicName: topicName.trim(),
        publishedText: draft.trim() || undefined,
        exercisesText: exercises.trim(),
      });
    },
    onSuccess: () => {
      setReplacing(null);
      setEditorMode(null);
      setDraft("");
      setExercises("");
      refresh();
      toast({ title: editorMode === "reupload" ? "Chapter reuploaded" : "Chapter updated", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not replace chapter", description: (err as Error).message, variant: "error" }),
  });

  const options = useMemo(() => {
    const classes = new Set<string>();
    const subjects = new Set<string>();
    const schools = new Set<string>();
    const uploaders = new Set<string>();
    for (const book of data ?? []) {
      if (book.classLabel) classes.add(book.classLabel);
      if (book.subjectLabel) subjects.add(book.subjectLabel);
      if (book.originSchool?.name) schools.add(book.originSchool.name);
      const creator = personFullName(book.createdBy?.firstName, book.createdBy?.lastName);
      if (creator) uploaders.add(creator);
      for (const chapter of book.chapters ?? []) {
        if (chapter.uploadedBySchool?.name) schools.add(chapter.uploadedBySchool.name);
        const uploader = chapter.uploadedBy
          ? personFullName(chapter.uploadedBy.firstName, chapter.uploadedBy.lastName)
          : "";
        if (uploader) uploaders.add(uploader);
      }
    }
    const sort = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b));
    return {
      classes: sort(classes),
      subjects: sort(subjects),
      schools: sort(schools),
      uploaders: sort(uploaders),
    };
  }, [data]);

  const books = useMemo(() => {
    const rows = [...(data ?? [])].sort((a, b) => {
      const byClass = (a.classLabel ?? "").localeCompare(b.classLabel ?? "");
      if (byClass) return byClass;
      const bySubject = (a.subjectLabel ?? "").localeCompare(b.subjectLabel ?? "");
      if (bySubject) return bySubject;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
    return rows
      .filter((book) => !classFilter || book.classLabel === classFilter)
      .filter((book) => !subjectFilter || book.subjectLabel === subjectFilter)
      .filter((book) => !schoolFilter || bookMatchesSchool(book, schoolFilter))
      .filter((book) => !uploaderFilter || bookMatchesUploader(book, uploaderFilter))
      .map((book) => ({
        ...book,
        chapters: (book.chapters ?? []).filter((chapter) => chapterVisible(book, chapter, schoolFilter, uploaderFilter)),
      }));
  }, [data, classFilter, subjectFilter, schoolFilter, uploaderFilter]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Book library"
        description="Click a subject to open its chapters. Schools can use a book only while it is assigned."
        actions={
          <Link href="/super-admin/library/new">
            <Button>Add book</Button>
          </Link>
        }
      />
      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Class" value={classFilter} onChange={setClassFilter} options={options.classes} />
        <FilterSelect label="Subject" value={subjectFilter} onChange={setSubjectFilter} options={options.subjects} />
        <FilterSelect label="School" value={schoolFilter} onChange={setSchoolFilter} options={options.schools} />
        <FilterSelect label="Uploader" value={uploaderFilter} onChange={setUploaderFilter} options={options.uploaders} />
      </div>
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <PageLoader variant="panel" />
        ) : !books.length ? (
          <EmptyState
            icon={<Library className="h-10 w-10" />}
            title="No books yet"
            description="Chapters already saved by teachers are imported the first time this page loads."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Publisher</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Chapters</TableHead>
                <TableHead>Schools</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.map((book) => {
                const open = openId === book.id;
                return (
                  <Fragment key={book.id}>
                    <TableRow>
                      <TableCell className="font-medium">
                        <Link href={`/super-admin/library/${book.id}`} className="hover:underline">
                          {book.title}
                        </Link>
                      </TableCell>
                      <TableCell>{book.publisher || "—"}</TableCell>
                      <TableCell>{book.classLabel || "—"}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          onClick={() => {
                            setOpenId(open ? null : book.id);
                            setReplacing(null);
                          }}
                        >
                          {book.subjectLabel || "Subject"}
                          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                        </button>
                      </TableCell>
                      <TableCell>{book.chapterCount}</TableCell>
                      <TableCell>{book.schoolCount}</TableCell>
                      <TableCell>
                        {personFullName(book.createdBy?.firstName, book.createdBy?.lastName) || "Unknown"}
                        {book.originSchool ? ` · ${book.originSchool.name}` : ""}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={removeBook.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete ${book.title}? This removes it for every school.`)) {
                              removeBook.mutate(book.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow key={`${book.id}-chapters`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-0">
                          <div className="space-y-3 px-4 py-3">
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                onClick={() => {
                                  setReplacing(null);
                                  setEditorMode(null);
                                  setUploadingBookId(book.id);
                                  setChapterName("");
                                  setTopicName("");
                                  setDraft("");
                                  setExercises("");
                                }}
                              >
                                Upload lecture
                              </Button>
                            </div>
                            {book.chapters.length ? (
                              book.chapters.map((chapter) => (
                                <div key={chapter.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                  <div>
                                    <div className="font-medium">
                                      {chapter.chapterNumber != null ? `${chapter.chapterNumber}. ` : ""}
                                      {chapter.title}
                                      {chapter.topicName ? ` — ${chapter.topicName}` : ""}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {chapter.uploadedBy
                                        ? personFullName(chapter.uploadedBy.firstName, chapter.uploadedBy.lastName)
                                        : "Unknown"}
                                      {chapter.uploadedBySchool?.name ? ` · ${chapter.uploadedBySchool.name}` : ""}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button type="button" variant="outline" onClick={() => void openEditor(book.id, chapter, "edit")}>
                                      Edit
                                    </Button>
                                    <Button type="button" variant="outline" onClick={() => void openEditor(book.id, chapter, "reupload")}>
                                      Reupload
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={removeChapter.isPending}
                                      onClick={() => {
                                        if (window.confirm(`Delete ${chapter.title}?`)) {
                                          removeChapter.mutate({ bookId: book.id, chapterId: chapter.id });
                                        }
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">No chapters in this book yet.</p>
                            )}
                            {uploadingBookId === book.id ? (
                              <div className="space-y-3 rounded-md border bg-background p-3">
                                <p className="text-sm font-medium">Upload lecture</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>Lecture name</Label>
                                    <Input value={chapterName} onChange={(e) => setChapterName(e.target.value)} placeholder="Unit 17 — Sets and Functions" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Topic name</Label>
                                    <Input value={topicName} onChange={(e) => setTopicName(e.target.value)} />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label>Lesson content</Label>
                                  <Textarea rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste the lecture text" />
                                </div>
                                <div className="space-y-1">
                                  <Label>Exercises</Label>
                                  <Textarea rows={8} value={exercises} onChange={(e) => setExercises(e.target.value)} placeholder="Exercise questions" />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    disabled={!chapterName.trim() || !draft.trim() || addChapter.isPending}
                                    onClick={() => addChapter.mutate()}
                                  >
                                    {addChapter.isPending ? "Uploading…" : "Save lecture"}
                                  </Button>
                                  <Button type="button" variant="outline" onClick={() => setUploadingBookId(null)}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                            {replacing && editorMode && openId === book.id ? (
                              <div className="space-y-3 rounded-md border bg-background p-3">
                                <p className="text-sm font-medium">
                                  {editorMode === "reupload" ? "Reupload" : "Edit"} {replacing.title}
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>Chapter name</Label>
                                    <Input value={chapterName} onChange={(e) => setChapterName(e.target.value)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Topic name</Label>
                                    <Input value={topicName} onChange={(e) => setTopicName(e.target.value)} />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label>Lesson content</Label>
                                  <Textarea
                                    rows={8}
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder={editorMode === "reupload" ? "Paste the new chapter text" : "Chapter text"}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Exercises</Label>
                                  <Textarea
                                    rows={8}
                                    value={exercises}
                                    onChange={(e) => setExercises(e.target.value)}
                                    placeholder="Exercise questions"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    disabled={(!chapterName.trim() && !topicName.trim() && !draft.trim()) || replaceChapter.isPending}
                                    onClick={() => replaceChapter.mutate()}
                                  >
                                    {replaceChapter.isPending ? "Saving…" : "Save chapter"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setReplacing(null);
                                      setEditorMode(null);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function bookMatchesSchool(book: LibraryBookListItem, school: string) {
  if (book.originSchool?.name === school) return true;
  return (book.chapters ?? []).some((chapter) => chapter.uploadedBySchool?.name === school);
}

function bookMatchesUploader(book: LibraryBookListItem, uploader: string) {
  if (personFullName(book.createdBy?.firstName, book.createdBy?.lastName) === uploader) return true;
  return (book.chapters ?? []).some((chapter) =>
    chapter.uploadedBy
      ? personFullName(chapter.uploadedBy.firstName, chapter.uploadedBy.lastName) === uploader
      : false,
  );
}

function chapterVisible(
  book: LibraryBookListItem,
  chapter: LibraryChapter,
  schoolFilter: string,
  uploaderFilter: string,
) {
  if (schoolFilter) {
    const chapterSchool = chapter.uploadedBySchool?.name === schoolFilter;
    const bookSchool = book.originSchool?.name === schoolFilter;
    if (!chapterSchool && !bookSchool) return false;
    if (!chapterSchool && bookSchool && chapter.uploadedBySchool?.name && chapter.uploadedBySchool.name !== schoolFilter) {
      return false;
    }
  }
  if (uploaderFilter) {
    const chapterUploader = chapter.uploadedBy
      ? personFullName(chapter.uploadedBy.firstName, chapter.uploadedBy.lastName)
      : "";
    if (chapterUploader !== uploaderFilter) return false;
  }
  return true;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
