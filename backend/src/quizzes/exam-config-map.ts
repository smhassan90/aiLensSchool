import { EXAM_PAPER_KINDS } from './exam-paper';

export function paperKindFromExamName(name: string): (typeof EXAM_PAPER_KINDS)[number] {
  const lower = name.toLowerCase();
  if (lower.includes('final')) return 'FINAL_TERM';
  if (lower.includes('mid')) return 'MID_TERM';
  return 'ASSESSMENT';
}
