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
import { stashPendingChapterPhotos } from "@/lib/chapter-pending-uploads";
import { localDateISO } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ArrowLeft, ImagePlus, X } from "lucide-react";

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

  const previews = useMemo(
    () => photos.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [photos],
  );

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
              Confirm content on the next screen. Each page uploads separately so successful pages are saved even if one fails.
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
                {previews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {previews.map((p, i) => (
                      <div key={p.url} className="relative">
                        <img src={p.url} alt="" className="h-20 w-16 rounded object-cover" />
                        <button
                          type="button"
                          className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow"
                          onClick={() => setPhotos((c) => c.filter((_, j) => j !== i))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  disabled={!classKey || !photos.length}
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
