import { parseClassNumber } from '../common/utils/section-class-label';
import { teacherDisplayName } from '../common/utils/person-name';
export type SubjectCandidate = { id: string; name: string; code: string };
export type TeacherCandidate = {
  id: string;
  gender: string | null;
  user: { firstName: string; lastName: string | null };
};

const SUBJECT_ALIASES: Record<string, string[]> = {
  sst: ['social studies', 'social science'],
  math: ['mathematics', 'maths'],
  maths: ['mathematics', 'math'],
  islamiyat: ['islamiat', 'islamiat studies'],
  islamiat: ['islamiyat'],
  computer: ['computer science', 'computers'],
  gk: ['general knowledge'],
  nazra: ['quran', 'qaida'],
  qaida: ['quran', 'nazra'],
};

export function normalizeSubjectLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchSubject(
  raw: string,
  subjects: SubjectCandidate[],
): { status: 'MATCHED' | 'UNKNOWN_SUBJECT' | 'AMBIGUOUS_SUBJECT'; subjectId?: string; matches?: SubjectCandidate[] } {
  const norm = normalizeSubjectLabel(raw);
  if (!norm) return { status: 'UNKNOWN_SUBJECT', matches: [] };

  const exact = subjects.filter(
    (s) => normalizeSubjectLabel(s.name) === norm || normalizeSubjectLabel(s.code) === norm,
  );
  if (exact.length === 1) return { status: 'MATCHED', subjectId: exact[0].id };
  if (exact.length > 1) return { status: 'AMBIGUOUS_SUBJECT', matches: exact };

  const aliasTargets = SUBJECT_ALIASES[norm] ?? [];
  const aliasHits = subjects.filter((s) => {
    const n = normalizeSubjectLabel(s.name);
    return aliasTargets.some((a) => n === a || n.startsWith(a));
  });
  if (aliasHits.length === 1) return { status: 'MATCHED', subjectId: aliasHits[0].id };
  if (aliasHits.length > 1) return { status: 'AMBIGUOUS_SUBJECT', matches: aliasHits };

  const starts = subjects.filter((s) => normalizeSubjectLabel(s.name).startsWith(norm) || norm.startsWith(normalizeSubjectLabel(s.name)));
  if (starts.length === 1) return { status: 'MATCHED', subjectId: starts[0].id };
  if (starts.length > 1) return { status: 'AMBIGUOUS_SUBJECT', matches: starts };

  return { status: 'UNKNOWN_SUBJECT', matches: [] };
}

const HONORIFIC_RE =
  /^(sir|miss|mr|mrs|ms|madam|muallima|ustad|ustaz|maam)\.?\s+/i;

export function stripTeacherHonorific(name: string): { honorific: string | null; rest: string } {
  const m = name.trim().match(HONORIFIC_RE);
  if (!m) return { honorific: null, rest: name.trim() };
  return { honorific: m[1].toLowerCase(), rest: name.trim().slice(m[0].length).trim() };
}

export function matchTeacher(
  raw: string,
  teachers: TeacherCandidate[],
): { status: 'MATCHED' | 'UNKNOWN_TEACHER' | 'AMBIGUOUS_TEACHER'; teacherId?: string; matches?: TeacherCandidate[] } {
  const { honorific, rest } = stripTeacherHonorific(raw);
  const target = rest.toLowerCase();
  if (!target) return { status: 'UNKNOWN_TEACHER', matches: [] };

  const hits = teachers.filter((t) => {
    const first = t.user.firstName.toLowerCase();
    const full = `${t.user.firstName} ${t.user.lastName ?? ''}`.trim().toLowerCase();
    const display = teacherDisplayName(t.user.firstName, t.user.lastName, t.gender).toLowerCase();
    return (
      target === first ||
      target === full ||
      display.includes(target) ||
      full.includes(target)
    );
  });

  if (hits.length === 1) return { status: 'MATCHED', teacherId: hits[0].id };
  if (hits.length === 0) return { status: 'UNKNOWN_TEACHER', matches: [] };

  if (honorific && hits.length > 1) {
    const genderHint = honorific === 'sir' || honorific === 'mr' || honorific === 'ustad' || honorific === 'ustaz'
      ? 'MALE'
      : 'FEMALE';
    const narrowed = hits.filter((t) => (t.gender ?? '').toUpperCase() === genderHint);
    if (narrowed.length === 1) return { status: 'MATCHED', teacherId: narrowed[0].id };
    if (narrowed.length > 1) return { status: 'AMBIGUOUS_TEACHER', matches: narrowed };
  }

  return { status: 'AMBIGUOUS_TEACHER', matches: hits };
}

export type SectionCandidate = {
  id: string;
  name: string;
  grade: { id: string; name: string; level: number };
};

export function matchSectionsForClassLabel(
  classLabel: string | null,
  sections: SectionCandidate[],
): {
  status: 'MATCHED' | 'UNKNOWN_CLASS' | 'SECTION_SELECTION_REQUIRED';
  sectionId?: string;
  sectionIds?: string[];
} {
  if (!classLabel?.trim()) {
    return { status: 'UNKNOWN_CLASS' };
  }
  const num = parseClassNumber(classLabel);
  const candidates = sections.filter((s) => {
    if (num != null) return s.grade.level === num || parseClassNumber(s.grade.name) === num;
    const norm = classLabel.toLowerCase();
    return s.grade.name.toLowerCase().includes(norm) || norm.includes(s.grade.name.toLowerCase());
  });
  if (candidates.length === 0) return { status: 'UNKNOWN_CLASS' };
  if (candidates.length === 1) return { status: 'MATCHED', sectionId: candidates[0].id };
  return {
    status: 'SECTION_SELECTION_REQUIRED',
    sectionIds: candidates.map((s) => s.id),
  };
}