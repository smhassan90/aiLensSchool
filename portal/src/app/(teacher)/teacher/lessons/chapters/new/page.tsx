"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { compressPhotosForUpload } from "@/lib/page-ocr";
import { rotateImageFile, type RotateDegrees } from "@/lib/rotate-image";
import { stashPendingChapterPhotos } from "@/lib/chapter-pending-uploads";
import { localDateISO } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ArrowLeft, ImagePlus, RotateCcw, RotateCw, X } from "lucide-react";

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

export default function NewChapterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"photos" | "paste">("photos");
  const [photos, setPhotos] = useState<File[]>([]);
  const [classKey, setClassKey] = useState("");
  const [chapterName, setChapterName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [rotatingIndex, setRotatingIndex] = useState<number | null>(null);

  const previews = useMemo(
    () => photos.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [photos],
  );

  const rotatePhoto = async (index: number, degrees: RotateDegrees) => {
    const file = photos[index];
    if (!file) return;
    setRotatingIndex(index);
    try {
      const rotated = await rotateImageFile(file, degrees);
      setPhotos((current) => current.map((f, i) => (i === index ? rotated : f)));
    } catch (err) {
      toast({
        title: "Could not rotate photo",
        description: err instanceof Error ? err.message : "Unexpected error",
        variant: "error",
      });
    } finally {
      setRotatingIndex(null);
    }
  };

  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previews]);

  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const selected = classes.data?.find((c) => `${c.sectionId}:${c.subjectId}` === classKey);

  const startPhotoChapterMutation = useMutation({
    mutationFn: async () => {
      if (!selected?.gradeId) throw new Error("Select a class");
      const pages = await compressPhotosForUpload(photos);
      const draft = await lessonsService.createChapterDraft({
        academicYearId: selected.academicYearId,
        gradeId: selected.gradeId,
        sectionId: selected.sectionId,
        subjectId: selected.subjectId,
        branchId: selected.branchId,
        chapterName: chapterName.trim() || undefined,
        topicName: topicName.trim() || undefined,
      });
      stashPendingChapterPhotos(draft.id, pages);
      return draft;
    },
    onSuccess: (lesson) => {
      queryClient.invalidateQueries({ queryKey: ["lesson-chapters"] });
      router.push(`/teacher/lessons/chapters/${lesson.id}`);
    },
    onError: (err) => {
      toast({
        title: "Could not start chapter",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const pasteMutation = useMutation({
    mutationFn: () => {
      if (!selected?.gradeId) throw new Error("Select a class");
      if (!chapterName.trim()) throw new Error("Chapter name required");
      return lessonsService.pasteChapter({
        academicYearId: selected.academicYearId,
        gradeId: selected.gradeId,
        sectionId: selected.sectionId,
        subjectId: selected.subjectId,
        branchId: selected.branchId,
        chapterName: chapterName.trim(),
        topicName: topicName.trim() || undefined,
        contentText: pasteText,
      });
    },
    onSuccess: (lesson) => {
      queryClient.invalidateQueries({ queryKey: ["lesson-chapters"] });
      router.push(`/teacher/lessons/chapters/${lesson.id}`);
    },
    onError: (err) => {
      toast({
        title: "Could not save",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const busy = startPhotoChapterMutation.isPending || pasteMutation.isPending;

  if (classes.isLoading) {
    return <PageLoader variant="page" task="lessons" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Add chapter content"
        description="One chapter at a time. Photos are only used to read text."
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          variant={tab === "photos" ? "default" : "outline"}
          onClick={() => setTab("photos")}
        >
          Photograph pages
        </Button>
        <Button
          type="button"
          variant={tab === "paste" ? "default" : "outline"}
          onClick={() => setTab("paste")}
        >
          Paste from book
        </Button>
      </div>

      {busy ? (
        <AiWait kind="extract" variant="page" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{tab === "photos" ? "Page photos" : "Paste text"}</CardTitle>
            <CardDescription>
              Photos must be large enough to see orientation. Rotate any sideways page upright before continuing.
              Each page uploads separately so successful pages are saved even if one fails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Class</Label>
                <Select value={classKey} onChange={(e) => setClassKey(e.target.value)}>
                  <option value="">Select</option>
                  {classes.data?.map((cls) => (
                    <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                      {cls.gradeName} {cls.sectionName} — {cls.subjectName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chapter name</Label>
                <Input value={chapterName} onChange={(e) => setChapterName(e.target.value)} placeholder="Chapter 2 — Nouns" />
              </div>
              <div className="space-y-2">
                <Label>Topic (optional)</Label>
                <Input value={topicName} onChange={(e) => setTopicName(e.target.value)} />
              </div>
            </div>

            {tab === "photos" ? (
              <>
                <label
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-8",
                    !classKey && "pointer-events-none opacity-50",
                  )}
                >
                  <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Add photos{photos.length ? ` (${photos.length})` : ""}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const next = Array.from(e.target.files ?? []).filter(isImageFile);
                      e.target.value = "";
                      setPhotos((c) => [...c, ...next]);
                    }}
                  />
                </label>
                {previews.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Check each page is upright. Use Rotate if text looks sideways or upside-down.
                    </p>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {previews.map((p, i) => (
                        <li key={p.url} className="relative overflow-hidden rounded-lg border bg-muted/20 p-2">
                          <button
                            type="button"
                            className="absolute right-2 top-2 z-10 rounded-full bg-background p-1 shadow"
                            onClick={() => setPhotos((c) => c.filter((_, j) => j !== i))}
                            aria-label={`Remove ${p.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <div className="flex min-h-[240px] items-center justify-center rounded-md bg-background/80 p-2 sm:min-h-[320px]">
                            <img
                              src={p.url}
                              alt={p.name}
                              className="max-h-[min(55vh,480px)] w-auto max-w-full object-contain"
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="truncate text-xs text-muted-foreground">
                              Page {i + 1} · {p.name}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1"
                                disabled={rotatingIndex !== null}
                                onClick={() => void rotatePhoto(i, 270)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Left
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1"
                                disabled={rotatingIndex !== null}
                                onClick={() => void rotatePhoto(i, 90)}
                              >
                                <RotateCw className="h-3.5 w-3.5" />
                                Right
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Button
                  disabled={!classKey || !photos.length || rotatingIndex !== null}
                  onClick={() => startPhotoChapterMutation.mutate()}
                >
                  Read text from photos
                </Button>
              </>
            ) : (
              <>
                <Textarea
                  rows={16}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste the chapter text from your PDF or book…"
                />
                <Button
                  disabled={!classKey || !chapterName.trim() || !pasteText.trim()}
                  onClick={() => pasteMutation.mutate()}
                >
                  Save and review
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
