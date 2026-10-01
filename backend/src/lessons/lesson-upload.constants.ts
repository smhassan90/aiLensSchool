/**
 * Max page files in one multipart request (Multer field limit).
 * There is no cap on how many pages a chapter can have overall.
 */
export const LESSON_MAX_PAGE_UPLOADS_PER_REQUEST = 200;

/** @deprecated Use LESSON_MAX_PAGE_UPLOADS_PER_REQUEST — kept for existing imports. */
export const LESSON_MAX_PAGE_UPLOADS = LESSON_MAX_PAGE_UPLOADS_PER_REQUEST;
