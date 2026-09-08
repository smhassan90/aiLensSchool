import { personFullName } from '../common/utils/person-name';

export const TPS_GRADING = [
  { min: 80, max: 100, letter: 'A+' },
  { min: 70, max: 79, letter: 'A' },
  { min: 60, max: 69, letter: 'B' },
  { min: 50, max: 59, letter: 'C' },
  { min: 40, max: 49, letter: 'D' },
  { min: 0, max: 39, letter: 'Unqualified' },
] as const;

const SUBJECT_ALIASES: Record<string, string[]> = {
  mathematics: ['mathematics', 'maths', 'math'],
  english: ['english'],
  physics: ['physics'],
  chemistry: ['chemistry'],
  sindhi: ['sindhi'],
  'pakistan studies': ['pakistan studies', 'pst', 'pak studies'],
  computer: ['computer', 'comp'],
  biology: ['biology', 'bio'],
  islamiat: ['islamiat', 'islamiyat'],
  urdu: ['urdu'],
  science: ['science'],
  'social studies': ['social studies', 'social st', 'sst'],
  arts: ['arts', 'art'],
};

export function letterGrade(avg: number, scale: 'TPS' | 'DEFAULT' = 'DEFAULT') {
  if (scale === 'TPS') {
    if (avg >= 80) return 'A+';
    if (avg >= 70) return 'A';
    if (avg >= 60) return 'B';
    if (avg >= 50) return 'C';
    if (avg >= 40) return 'D';
    return 'Unqualified';
  }
  if (avg >= 85) return 'A';
  if (avg >= 70) return 'B';
  if (avg >= 55) return 'C';
  if (avg >= 40) return 'D';
  return 'F';
}

export function templateCodeForGrade(name: string, level: number): string | null {
  const n = name.toLowerCase();
  if (/level\s*[12]\b/.test(n) || /pre[- ]?primary/.test(n)) return null;
  if (level === 10 || /\b(class\s*)?(10|x)\b/.test(n)) return 'CLASS_10';
  if (level === 9 || /\b(class\s*)?(9|ix)\b/.test(n)) return 'CLASS_9';
  const fromName = n.match(/class\s*(\d+)/);
  const lv = fromName ? Number(fromName[1]) : level;
  if (lv >= 1 && lv <= 3) return 'CLASS_1_3';
  if (lv >= 4 && lv <= 8) return 'CLASS_4_8';
  return null;
}

export function streamLabel(scienceGroup?: string | null) {
  if (scienceGroup === 'BIOLOGY') return 'Bio . science';
  if (scienceGroup === 'COMPUTER') return 'Comp . science';
  return '';
}

export function fatherDisplayName(
  parents: Array<{
    relationship?: string | null;
    isPrimary?: boolean | null;
    parent?: { user?: { firstName?: string | null; lastName?: string | null } | null } | null;
  }>,
) {
  const father = parents.find((row) => row.relationship === 'FATHER');
  const chosen = father ?? parents.find((row) => row.isPrimary) ?? parents[0];
  const user = chosen?.parent?.user;
  if (!user) return '';
  return personFullName(user.firstName, user.lastName);
}

function canon(name: string) {
  return name
    .toLowerCase()
    .replace(/[.\-\/(),]/g, ' ')
    .replace(/\b(i{1,3}|iv|vi{0,3}|1|2)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function subjectMatches(subjectName: string, matchSubject: string) {
  const c = canon(subjectName);
  const keys = SUBJECT_ALIASES[matchSubject.toLowerCase()] ?? [canon(matchSubject)];
  return keys.some((key) => c === key || c.startsWith(`${key} `) || c.endsWith(` ${key}`));
}

export function pickSubject<T extends { name: string }>(
  subjects: T[],
  matchSubject: string,
  choiceGroup?: string | null,
  scienceGroup?: string | null,
) {
  const wanted =
    choiceGroup === 'SCIENCE_GROUP'
      ? scienceGroup === 'BIOLOGY'
        ? 'biology'
        : scienceGroup === 'COMPUTER'
          ? 'computer'
          : matchSubject
      : matchSubject;

  const hits = subjects.filter((subject) => subjectMatches(subject.name, wanted));
  if (hits.length) return hits[0];
  if (choiceGroup === 'SCIENCE_GROUP' && !scienceGroup) {
    return (
      subjects.find((subject) => subjectMatches(subject.name, 'computer')) ??
      subjects.find((subject) => subjectMatches(subject.name, 'biology')) ??
      null
    );
  }
  return null;
}

type MarkLike = {
  subjectId: string;
  title: string;
  type?: string | null;
  maxMarks: { toString(): string } | number | string;
  marks: { toString(): string } | number | string;
  examConfig?: { name?: string | null } | null;
};

export function pickObtained(
  assessments: MarkLike[],
  subjectId: string | null,
  label: string,
  maxMarks: number | null,
  termLabel: string,
) {
  if (!subjectId) return null;
  const ofSubject = assessments.filter((row) => row.subjectId === subjectId);
  if (!ofSubject.length) return null;

  const term = termLabel.trim().toLowerCase();
  const termHits = ofSubject.filter((row) => {
    const examName = row.examConfig?.name?.trim().toLowerCase() ?? '';
    const title = row.title.trim().toLowerCase();
    return (examName && examName === term) || title.includes(term);
  });
  const pool = termHits.length ? termHits : ofSubject;

  if (/lit/i.test(label)) {
    return (
      pool.find((row) => /lit|literature|reading/i.test(row.title)) ??
      pool.find((row) => maxMarks != null && Number(row.maxMarks) === maxMarks) ??
      null
    );
  }
  if (/lang/i.test(label)) {
    return (
      pool.find((row) => /lang|grammar|language/i.test(row.title)) ??
      pool.find((row) => maxMarks != null && Number(row.maxMarks) === maxMarks) ??
      null
    );
  }

  const termExam = pool.find((row) => row.type === 'TERM_EXAM');
  if (termExam) return termExam;
  if (maxMarks != null) {
    const byMax = pool.find((row) => Number(row.maxMarks) === maxMarks);
    if (byMax) return byMax;
  }
  return pool[pool.length - 1] ?? null;
}

export function gradeLevelNeedsStream(name: string, level: number) {
  return templateCodeForGrade(name, level) === 'CLASS_9' || templateCodeForGrade(name, level) === 'CLASS_10';
}
