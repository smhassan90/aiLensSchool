/** Must match backend `LESSON_MAX_PAGE_UPLOADS`. */
export const LESSON_MAX_PAGE_UPLOADS = 10;

/** Client abort timeout for photo extract — scales with how many images are in this upload. */
export function lessonExtractTimeoutMs(imageCount: number): number {
  const count = Math.max(1, Math.min(LESSON_MAX_PAGE_UPLOADS, Math.floor(imageCount) || 1));
  // Backend transcribes pages sequentially with up to ~2–4 min per page for large batches.
  const baseMs = 180_000;
  const perExtraPageMs = 100_000;
  return baseMs + (count - 1) * perExtraPageMs;
}
