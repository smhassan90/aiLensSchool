/** In-memory stash so chapter detail can read photos after navigation from “new chapter”. */
const pendingByLessonId = new Map<string, File[]>();

export function stashPendingChapterPhotos(lessonId: string, files: File[]) {
  if (!files.length) return;
  pendingByLessonId.set(lessonId, files);
}

export function takePendingChapterPhotos(lessonId: string): File[] {
  const files = pendingByLessonId.get(lessonId);
  pendingByLessonId.delete(lessonId);
  return files ?? [];
}
