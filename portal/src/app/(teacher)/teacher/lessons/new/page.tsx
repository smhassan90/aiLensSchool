"use client";

import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
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
import { ArrowLeft, ImagePlus, X } from "lucide-react";

const MAX_PHOTOS = 10;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

function optionalPage(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default function NewLessonPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<File[]>([]);
  const [classKey, setClassKey] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [formError, setFormError] = useState("");

  const previews = useMemo(
    () => photos.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [photos],
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const selectedClass = classes.data?.find(
    (cls) => `${cls.sectionId}:${cls.subjectId}` === classKey,
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedClass?.gradeId) {
        throw new Error("Select a class");
      }
      return lessonsService.extract({
        academicYearId: selectedClass.academicYearId,
        gradeId: selectedClass.gradeId,
        sectionId: selectedClass.sectionId,
        subjectId: selectedClass.subjectId,
        branchId: selectedClass.branchId,
        date,
        teacherNotes: teacherNotes.trim() || undefined,
        pageFrom: optionalPage(pageFrom),
        pageTo: optionalPage(pageTo),
        pages: photos,
      });
    },
    onSuccess: (lesson) => {
      toast({
        title: "Page content extracted",
        description: "Photos were not saved. Review the extracted lesson next.",
        variant: "success",
      });
      router.push(`/teacher/lessons/${lesson.id}/review`);
    },
    onError: (err) => {
      toast({
        title: "Could not extract lesson",
        description: err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const onPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(e.target.files ?? []);
    e.target.value = "";
    const allowed = next.filter(isImageFile);
    if (!allowed.length && next.length) {
      toast({
        title: "Use photo files",
        description: "JPEG, PNG, WebP, or HEIC images are supported.",
        variant: "error",
      });
      return;
    }
    setPhotos((current) => [...current, ...allowed].slice(0, MAX_PHOTOS));
    setFormError("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass?.gradeId) {
      setFormError("Select the class this lesson belongs to.");
      toast({ title: "Select a class", variant: "error" });
      return;
    }
    if (!date) {
      setFormError("Choose the lesson date.");
      toast({ title: "Date is required", variant: "error" });
      return;
    }
    if (!photos.length) {
      setFormError("Upload photos of the pages you taught today.");
      toast({
        title: "Photos required",
        description: "Upload photos of the pages you taught today.",
        variant: "error",
      });
      return;
    }
    setFormError("");
    mutation.mutate();
  };

  if (classes.isLoading) {
    return <PageLoader variant="page" />;
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Today's Lesson"
        description="Upload photos of the pages you taught. Photos are not saved — only the extracted content is kept."
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      {mutation.isPending ? (
        <div className="mx-auto max-w-2xl">
          <AiWait kind="extract" variant="page" />
        </div>
      ) : (
      <form onSubmit={onSubmit} className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Class and pages</CardTitle>
            <CardDescription>
              Select the class, then photograph the textbook pages covered today.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="classPicker">Assigned Class</Label>
              <Select
                id="classPicker"
                value={classKey}
                onChange={(e) => {
                  setClassKey(e.target.value);
                  setFormError("");
                }}
              >
                <option value="">Select class</option>
                {classes.data?.map((cls) => (
                  <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                    {cls.gradeName} {cls.sectionName} — {cls.subjectName}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pageFrom">Page from (optional)</Label>
                <Input id="pageFrom" type="number" min={1} value={pageFrom} onChange={(e) => setPageFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pageTo">Page to (optional)</Label>
                <Input id="pageTo" type="number" min={1} value={pageTo} onChange={(e) => setPageTo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pages">Photos of pages taught</Label>
              <label
                htmlFor="pages"
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/40 px-4 py-8 text-center"
              >
                <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Add page photos</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  JPEG, PNG or WebP · up to {MAX_PHOTOS} photos · not stored on the server
                </span>
              </label>
              <input
                id="pages"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
                multiple
                className="sr-only"
                onChange={onPhotosChange}
              />
              {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {previews.map((preview, index) => (
                    <div key={preview.url} className="relative overflow-hidden rounded-md border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview.url} alt={preview.name} className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                        onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                        aria-label={`Remove ${preview.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacherNotes">Teacher notes (optional)</Label>
              <Textarea
                id="teacherNotes"
                rows={3}
                placeholder="Anything extra that is not visible in the photos"
                value={teacherNotes}
                onChange={(e) => setTeacherNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/teacher/lessons">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit">
            Extract lesson from photos
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}
