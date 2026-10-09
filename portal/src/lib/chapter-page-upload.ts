import { lessonsService } from "@/services/lessons.service";
import { ApiClientError } from "@/lib/api-client";
import type { Lesson } from "@/lib/types";

export type ChapterPageUploadStatus = "queued" | "uploading" | "failed";

import type { OcrUploadProgressSnapshot } from "@/lib/ocr-upload-progress";

export type ChapterPageUploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: ChapterPageUploadStatus;
  error?: string;
  ocrProgress?: OcrUploadProgressSnapshot | null;
};

export function createChapterPageUploadItems(files: File[]): ChapterPageUploadItem[] {
  return files.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    status: "queued" as const,
  }));
}

export function releaseChapterPageUploadPreviews(items: ChapterPageUploadItem[]) {
  for (const item of items) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

export async function uploadSingleChapterPage(
  lessonId: string,
  file: File,
  uploadId: string,
): Promise<Lesson> {
  return lessonsService.appendChapterPhotos(lessonId, [file], uploadId);
}

export function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}
