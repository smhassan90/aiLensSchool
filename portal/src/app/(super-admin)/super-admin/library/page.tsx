"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { libraryBooksService, type LibraryBookListItem, type LibraryChapter } from "@/services/library-books.service";
import { personFullName } from "@/lib/person-name";
import { useToast } from "@/providers/toast-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, Library, Pencil, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIBRARY_CLASSES, LIBRARY_LANGUAGES, LIBRARY_SUBJECTS, optionsWithCurrent } from "@/lib/library-book-options";

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
  const [sourceText, setSourceText] = useState("");
  const [lectureReady, setLectureReady] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("");
  const [uploaderFilter, setUploaderFilter] = useState("");
  const [editingBook, setEditingBook] = useState<LibraryBookListItem | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [bookPublisher, setBookPublisher] = useState("");
  const [bookClass, setBookClass] = useState("");
  const [bookSubject, setBookSubject] = useState("");
  const [bookLanguage, setBookLanguage] = useState("English");
  const [bookYear, setBookYear] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "book"; id: string; name: string }
    | { kind: "chapter"; bookId: string; chapterId: string; name: string }
    | null
  >(null);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["library-books"],
    queryFn: () => libraryBooksService.list(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["library-books"] });

  const removeBook = useMutation({
    mutationFn: (id: string) => libraryBooksService.remove(id),
    onSuccess: () => {
      refresh();
      setConfirmDelete(null);
      toast({ title: "Book removed", description: "It is no longer available to any school.", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not delete book", description: (err as Error).message, variant: "error" }),
  });

  const compileLecture = useMutation({
    mutationFn: () => {
      if (!uploadingBookId) throw new Error("Choose a book");
      return libraryBooksService.compileLecture(uploadingBookId, sourceText.trim());
    },
    onSuccess: (result) => {
      if (result.chapterName) setChapterName(result.chapterName);
      if (result.topicName) setTopicName(result.topicName);
      setDraft(result.lessonBody);
      setExercises(result.exercises);
      setLectureReady(true);
      toast({ title: "Lecture compiled", description: "Review the lesson and exercises, then save.", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not compile", description: (err as Error).message, variant: "error" }),
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
      setSourceText("");
      setDraft("");
      setExercises("");
      setLectureReady(false);
      refresh();
      toast({ title: "Lecture saved", description: "Lesson text and exercises are stored separately.", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not upload lecture", description: (err as Error).message, variant: "error" }),
  });

  const removeChapter = useMutation({
    mutationFn: (input: { bookId: string; chapterId: string }) =>
      libraryBooksService.removeChapter(input.bookId, input.chapterId),
    onSuccess: () => {
      setConfirmDelete(null);
      refresh();
      toast({ title: "Chapter removed", description: "It will not be imported again.", variant: "success" });
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
      toast({ title: editorMode === "reupload" ? "Chapter replaced" : "Chapter saved", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not replace chapter", description: (err as Error).message, variant: "error" }),
  });

  const saveBook = useMutation({
    mutationFn: () => {
      if (!editingBook) throw new Error("Choose a book");
      return libraryBooksService.update(editingBook.id, {
        title: bookTitle.trim(),
        publisher: bookPublisher.trim(),
        classLabel: bookClass.trim(),
        subjectLabel: bookSubject.trim(),
        language: bookLanguage,
        editionYear: bookYear.trim(),
      });
    },
    onSuccess: () => {
      setEditingBook(null);
      refresh();
      toast({ title: "Book updated", description: "Name, class, and subject are saved.", variant: "success" });
    },
    onError: (err) => toast({ title: "Could not update book", description: (err as Error).message, variant: "error" }),
  });

  const openBookEditor = (book: LibraryBookListItem) => {
    setEditingBook(book);
    setBookTitle(book.title);
    setBookPublisher(book.publisher || "");
    setBookClass(book.classLabel || "");
    setBookSubject(book.subjectLabel || "");
    setBookLanguage(book.language || "English");
    setBookYear(book.editionYear || "");
  };

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
        description="Open a book to see its lectures. Assign a book before a school can use it."
        actions={
          <Link href="/super-admin/library/new">
            <Button>Add book</Button>
          </Link>
        }
      />
      {isError && (
        <div role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}
      <div className="mb-5 grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Class" value={classFilter} onChange={setClassFilter} options={options.classes} />
        <FilterSelect label="Subject" value={subjectFilter} onChange={setSubjectFilter} options={options.subjects} />
        <FilterSelect label="School" value={schoolFilter} onChange={setSchoolFilter} options={options.schools} />
        <FilterSelect label="Uploader" value={uploaderFilter} onChange={setUploaderFilter} options={options.uploaders} />
      </div>
      {isLoading ? (
        <PageLoader variant="panel" />
      ) : !books.length ? (
        <EmptyState
          icon={<Library className="h-10 w-10" />}
          title="No books yet"
          description="Add a book, then upload lectures into it."
        />
      ) : (
        <div className="space-y-3">
          {books.map((book) => {
            const open = openId === book.id;
            return (
              <article key={book.id} className={cn("overflow-hidden rounded-2xl border bg-card shadow-sm", open && "ring-1 ring-primary/30")}>
                <div className="flex items-stretch">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-4 px-4 py-4 text-left hover:bg-muted/40"
                    onClick={() => {
                      setOpenId(open ? null : book.id);
                      setReplacing(null);
                      setEditorMode(null);
                    }}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                      {(book.subjectLabel || book.title).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">{book.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {book.publisher ? <span>{book.publisher}</span> : null}
                        {book.classLabel ? <Badge variant="secondary">{book.classLabel}</Badge> : null}
                        {book.subjectLabel ? <Badge>{book.subjectLabel}</Badge> : null}
                        {book.language ? <Badge variant="outline">{book.language}</Badge> : null}
                        <span>{book.chapterCount} lectures</span>
                        <span>{book.schoolCount} schools</span>
                      </span>
                    </span>
                    <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  </button>
                  <div className="flex items-center gap-1 pr-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${book.title}`}
                      onClick={() => openBookEditor(book)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${book.title}`}
                      onClick={() => setConfirmDelete({ kind: "book", id: book.id, name: book.title })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {open ? (
                  <div className="space-y-4 border-t bg-muted/20 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Added by {personFullName(book.createdBy?.firstName, book.createdBy?.lastName) || "Unknown"}
                        {book.originSchool ? ` · ${book.originSchool.name}` : ""}
                      </p>
                      <Button
                        type="button"
                        onClick={() => {
                          setReplacing(null);
                          setEditorMode(null);
                          setUploadingBookId(book.id);
                          setChapterName("");
                          setTopicName("");
                          setSourceText("");
                          setDraft("");
                          setExercises("");
                          setLectureReady(false);
                        }}
                      >
                        <Upload className="h-4 w-4" />
                        Upload lecture
                      </Button>
                    </div>
                    {book.chapters.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {book.chapters.map((chapter) => (
                          <div key={chapter.id} className="rounded-xl border bg-background p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium leading-snug">
                                  {chapter.chapterNumber != null ? (
                                    <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-1.5 text-xs text-primary">
                                      {chapter.chapterNumber}
                                    </span>
                                  ) : null}
                                  {chapter.title}
                                </p>
                                {chapter.topicName ? <p className="mt-1 text-sm text-muted-foreground">{chapter.topicName}</p> : null}
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {chapter.uploadedBy
                                    ? personFullName(chapter.uploadedBy.firstName, chapter.uploadedBy.lastName)
                                    : "Unknown"}
                                  {chapter.uploadedBySchool?.name ? ` · ${chapter.uploadedBySchool.name}` : ""}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                aria-label={`Delete ${chapter.title}`}
                                onClick={() =>
                                  setConfirmDelete({
                                    kind: "chapter",
                                    bookId: book.id,
                                    chapterId: chapter.id,
                                    name: chapter.title,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => void openEditor(book.id, chapter, "edit")}>
                                Edit
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => void openEditor(book.id, chapter, "reupload")}>
                                Reupload
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed bg-background px-4 py-6 text-center text-sm text-muted-foreground">
                        No lectures in this book yet.
                      </p>
                    )}
                    {uploadingBookId === book.id ? (
                      <LecturePanel
                        title="Upload lecture"
                        chapterName={chapterName}
                        topicName={topicName}
                        sourceText={sourceText}
                        draft={draft}
                        exercises={exercises}
                        lectureReady={lectureReady}
                        compiling={compileLecture.isPending}
                        saving={addChapter.isPending}
                        saveLabel={addChapter.isPending ? "Saving…" : "Save chapter"}
                        onChapterName={setChapterName}
                        onTopicName={setTopicName}
                        onSourceText={(value) => {
                          setSourceText(value);
                          setLectureReady(false);
                        }}
                        onDraft={setDraft}
                        onExercises={setExercises}
                        onCompile={() => compileLecture.mutate()}
                        onSave={() => addChapter.mutate()}
                        onCancel={() => setUploadingBookId(null)}
                        showSource
                      />
                    ) : null}
                    {replacing && editorMode && openId === book.id ? (
                      <LecturePanel
                        title={editorMode === "reupload" ? `Reupload ${replacing.title}` : `Edit ${replacing.title}`}
                        chapterName={chapterName}
                        topicName={topicName}
                        sourceText=""
                        draft={draft}
                        exercises={exercises}
                        lectureReady
                        compiling={false}
                        saving={replaceChapter.isPending}
                        saveLabel={replaceChapter.isPending ? "Saving…" : "Save chapter"}
                        onChapterName={setChapterName}
                        onTopicName={setTopicName}
                        onSourceText={() => undefined}
                        onDraft={setDraft}
                        onExercises={setExercises}
                        onCompile={() => undefined}
                        onSave={() => replaceChapter.mutate()}
                        onCancel={() => {
                          setReplacing(null);
                          setEditorMode(null);
                        }}
                        showSource={false}
                      />
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      <Dialog open={Boolean(editingBook)} onOpenChange={(next) => !next && setEditingBook(null)}>
        <DialogContent onClose={() => setEditingBook(null)}>
          <DialogHeader>
            <DialogTitle>Edit book</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Book name</Label>
              <Input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Publisher</Label>
              <Input value={bookPublisher} onChange={(e) => setBookPublisher(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Edition year</Label>
              <Input value={bookYear} onChange={(e) => setBookYear(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={bookClass} onChange={(e) => setBookClass(e.target.value)}>
                <option value="">Select a class</option>
                {optionsWithCurrent(LIBRARY_CLASSES, bookClass).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={bookSubject} onChange={(e) => setBookSubject(e.target.value)}>
                <option value="">Select a subject</option>
                {optionsWithCurrent(LIBRARY_SUBJECTS, bookSubject).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={bookLanguage} onChange={(e) => setBookLanguage(e.target.value)}>
                {LIBRARY_LANGUAGES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditingBook(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!bookTitle.trim() || saveBook.isPending} onClick={() => saveBook.mutate()}>
              {saveBook.isPending ? "Saving…" : "Save book"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(confirmDelete)} onOpenChange={(next) => !next && setConfirmDelete(null)}>
        <DialogContent onClose={() => setConfirmDelete(null)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDelete?.kind === "book" ? "Delete this book?" : "Delete this chapter?"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {confirmDelete?.kind === "book"
              ? `${confirmDelete.name} will be removed for every school. Lectures inside it are deleted too.`
              : `${confirmDelete?.name ?? "This chapter"} will be removed and will not be imported again.`}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeBook.isPending || removeChapter.isPending}
              onClick={() => {
                if (!confirmDelete) return;
                if (confirmDelete.kind === "book") removeBook.mutate(confirmDelete.id);
                else removeChapter.mutate({ bookId: confirmDelete.bookId, chapterId: confirmDelete.chapterId });
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LecturePanel(props: {
  title: string;
  chapterName: string;
  topicName: string;
  sourceText: string;
  draft: string;
  exercises: string;
  lectureReady: boolean;
  compiling: boolean;
  saving: boolean;
  saveLabel: string;
  showSource: boolean;
  onChapterName: (value: string) => void;
  onTopicName: (value: string) => void;
  onSourceText: (value: string) => void;
  onDraft: (value: string) => void;
  onExercises: (value: string) => void;
  onCompile: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
      <p className="text-sm font-semibold">{props.title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Lecture name</Label>
          <Input value={props.chapterName} onChange={(e) => props.onChapterName(e.target.value)} placeholder="Unit 17 — Sets and Functions" />
        </div>
        <div className="space-y-1">
          <Label>Topic</Label>
          <Input value={props.topicName} onChange={(e) => props.onTopicName(e.target.value)} />
        </div>
      </div>
      {props.showSource ? (
        <div className="space-y-2">
          <Label>Chapter text</Label>
          <Textarea
            rows={8}
            value={props.sourceText}
            onChange={(e) => props.onSourceText(e.target.value)}
            placeholder="Paste the full chapter, including exercises"
          />
          <Button type="button" variant="outline" disabled={!props.sourceText.trim() || props.compiling} onClick={props.onCompile}>
            {props.compiling ? "Compiling…" : "Compile with AI"}
          </Button>
        </div>
      ) : null}
      {props.lectureReady ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1">
            <Label>Lesson content</Label>
            <Textarea rows={8} value={props.draft} onChange={(e) => props.onDraft(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Exercises</Label>
            <Textarea rows={8} value={props.exercises} onChange={(e) => props.onExercises(e.target.value)} />
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={props.showSource ? !props.lectureReady || !props.chapterName.trim() || !props.draft.trim() || props.saving : props.saving}
          onClick={props.onSave}
        >
          {props.saveLabel}
        </Button>
        <Button type="button" variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
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
