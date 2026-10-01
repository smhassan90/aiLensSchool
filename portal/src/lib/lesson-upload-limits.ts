/** Must match backend `LESSON_MAX_PAGE_UPLOADS_PER_REQUEST` (Multer only, not chapter total). */
export const LESSON_MAX_PAGE_UPLOADS_PER_REQUEST = 200;

/** Client abort timeout for photo extract — scales with how many images are in this upload. */
export function lessonExtractTimeoutMs(imageCount: number): number {
  const count = Math.max(1, Math.floor(imageCount) || 1);
  const baseMs = 180_000;
  const perExtraPageMs = 100_000;
  return baseMs + (count - 1) * perExtraPageMs;
}
