"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { studentsService } from "@/services/students.service";
import { ApiClientError, assetUrl } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";

type StudentIdPhotoUploadProps = {
  studentId: string;
  photoUrl?: string | null;
  firstName?: string;
  lastName?: string;
  invalidateKeys?: string[][];
  className?: string;
  previewClassName?: string;
  buttonLabel?: string;
  showPreview?: boolean;
  buttonClassName?: string;
};

export function StudentIdPhotoUpload({
  studentId,
  photoUrl,
  firstName,
  lastName,
  invalidateKeys = [],
  className,
  previewClassName,
  buttonLabel = "Upload photo",
  showPreview = true,
  buttonClassName,
}: StudentIdPhotoUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const photo = assetUrl(photoUrl);
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || "Student";

  const upload = useMutation({
    mutationFn: (file: File) => studentsService.uploadPhoto(studentId, file),
    onSuccess: () => {
      toast({ title: "Photo uploaded", description: "This photo will appear on the student's ID card.", variant: "success" });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) =>
      toast({
        title: "Upload failed",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  return (
    <div className={cn("flex flex-col items-start gap-3", className)}>
      {showPreview ? (
        <div
          className={cn(
            "overflow-hidden rounded-xl border bg-slate-100",
            previewClassName ?? "h-32 w-24",
          )}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-400">
              No photo yet
            </div>
          )}
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={buttonClassName}
        disabled={upload.isPending}
        onClick={() => fileRef.current?.click()}
      >
        <Camera className="h-4 w-4" />
        {upload.isPending ? "Uploading…" : buttonLabel}
      </Button>
    </div>
  );
}
