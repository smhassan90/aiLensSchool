import { PlannerChapterAnalysis } from '../ai/schemas/planner-chapter-analysis.schema';
import { TeachingHelpBasis } from '../ai/schemas/teaching-help.schema';
import { excerptAroundAnchors } from './teaching-help-excerpt';

export type TeachingHelpContextInput = {
  lessonTitle: string;
  objectives: string[];
  portionKeys: string[];
  chapterTitle: string;
  contentHash: string | null;
  libraryBookChapterId: string | null;
  analysis: PlannerChapterAnalysis | null;
  chapterText: string | null;
  packSummary: string | null;
  bookTitle: string | null;
};

export type ResolvedTeachingHelpContext = {
  basis: TeachingHelpBasis;
  chapterExcerpt: string;
  contentSources: {
    bookTitle: string | null;
    chapterTitle: string;
    libraryBookChapterId: string | null;
  };
  anchorsUsed: number;
  excerptCharCount: number;
  missingNotes: string[];
};

const MIN_EXCERPT_CHARS = 80;
const MAX_EXCERPT_CHARS = 6000;

export function resolveTeachingHelpContext(input: TeachingHelpContextInput): ResolvedTeachingHelpContext {
  const anchors =
    input.analysis?.portions
      ?.filter((p) => input.portionKeys.length === 0 || input.portionKeys.includes(p.portionKey))
      .map((p) => p.contentAnchor) ?? [];

  const missingNotes: string[] = [];
  let chapterExcerpt = '';
  if (input.chapterText?.trim()) {
    chapterExcerpt = excerptAroundAnchors(input.chapterText, anchors, MAX_EXCERPT_CHARS);
  } else if (input.libraryBookChapterId) {
    missingNotes.push('Chapter text could not be loaded for the granted library chapter.');
  } else {
    missingNotes.push('No library chapter is linked to this planner lesson.');
  }

  let basis: TeachingHelpBasis;
  const summary = input.packSummary?.trim() ?? '';
  if (chapterExcerpt.trim().length >= MIN_EXCERPT_CHARS) {
    basis = 'CHAPTER_TEXT';
  } else if (summary.length >= MIN_EXCERPT_CHARS) {
    basis = 'CHAPTER_TEXT';
    chapterExcerpt = summary.slice(0, MAX_EXCERPT_CHARS);
    missingNotes.push('Using chapter teaching summary from the library pack (full textbook text was short or missing).');
  } else if (input.objectives.length > 0) {
    basis = 'OBJECTIVES_ONLY';
    if (input.chapterText?.trim() || summary) {
      missingNotes.push('Chapter excerpt too short; using lesson objectives only.');
    }
    chapterExcerpt = summary.slice(0, MAX_EXCERPT_CHARS);
  } else {
    basis = 'UNAVAILABLE';
  }

  return {
    basis,
    chapterExcerpt,
    contentSources: {
      bookTitle: input.bookTitle,
      chapterTitle: input.chapterTitle,
      libraryBookChapterId: input.libraryBookChapterId,
    },
    anchorsUsed: anchors.length,
    excerptCharCount: chapterExcerpt.length,
    missingNotes,
  };
}

export function boundedContextForAi(excerpt: string, objectives: string[], stagesSummary: string): string {
  const obj = objectives.slice(0, 12).join('; ').slice(0, 2000);
  const stages = stagesSummary.slice(0, 1500);
  const text = excerpt.slice(0, 6000);
  return `OBJECTIVES: ${obj}\nSTAGES: ${stages}\nEXCERPT:\n${text}`;
}
