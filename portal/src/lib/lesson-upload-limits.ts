/** Must match backend `LESSON_MAX_PAGE_UPLOADS`. */
export const LESSON_MAX_PAGE_UPLOADS = 10;

/** Client abort timeout for photo extract — scales with how many images are in this upload. */
export function lessonExtractTimeoutMs(imageCount: number): number {
  const count = Math.max(1, Math.min(LESSON_MAX_PAGE_UPLOADS, Math.floor(imageCount) || 1));
  const baseMs = 120_000;
  const perExtraPageMs = 40_000;
  return baseMs + (count - 1) * perExtraPageMs;
}
