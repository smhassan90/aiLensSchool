import { coerceLessonDisplayText } from "@/lib/lesson-display-text";
import { formatDate } from "@/lib/utils";

export type ChapterDisplayFields = {
  chapterName?: string | null;
  topicName?: string | null;
  chapterProgress?: string | null;
  extractedText?: string | null;
  aiSummary?: string | null;
  pageFrom?: number | null;
  pageTo?: number | null;
  date?: string | null;
};

export function chapterTitle(ch: ChapterDisplayFields) {
  return ch.chapterName || ch.topicName || "Chapter";
}

export function chapterSubtitle(ch: ChapterDisplayFields) {
  if (ch.chapterName && ch.topicName && ch.topicName !== ch.chapterName) {
    return ch.topicName;
  }
  return null;
}

export function chapterContentPreview(ch: ChapterDisplayFields, maxLen = 200) {
  const raw = coerceLessonDisplayText(ch.extractedText ?? ch.aiSummary ?? "");
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "No preview text — open the chapter to check content.";
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen).trim()}…`;
}

export function pageRangeLabel(ch: ChapterDisplayFields) {
  if (ch.pageFrom && ch.pageTo) return `Pages ${ch.pageFrom}–${ch.pageTo}`;
  if (ch.pageFrom) return `Page ${ch.pageFrom}`;
  return null;
}

export function chapterMetaLine(ch: ChapterDisplayFields) {
  const pages = pageRangeLabel(ch);
  return [pages, ch.date ? `Added ${formatDate(ch.date)}` : null].filter(Boolean).join(" · ");
}

export function chapterProgressLabel(progress?: string | null) {
  if (progress === "COMPLETED") return "Completed";
  if (progress === "IN_PROGRESS") return "In progress";
  return null;
}
