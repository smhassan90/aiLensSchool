type SectionLike = {
  name?: string | null;
  grade?: { name?: string | null; level?: number | null } | null;
} | null;

/** Pulls 8 from "Class 8", "Grade 8", "Level 8", etc. */
export function parseClassNumber(value?: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/(?:class|grade|level)\s*(\d+)/i);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) ? num : null;
  }
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function gradeClassNumber(section?: SectionLike): number | null {
  if (!section?.grade) return null;
  return parseClassNumber(section.grade.name);
}

/** Grade / class only, e.g. "Class 8". Section letter is excluded. */
export function gradeClassLabel(section?: SectionLike): string {
  if (!section) return '—';
  const classNumber = gradeClassNumber(section);
  if (classNumber != null) return `Class ${classNumber}`;
  const gradeName = section.grade?.name?.trim() ?? '';
  if (gradeName) return gradeName;
  return '—';
}

/** Full label including section, e.g. "Class 8 A" or "Level 1 A". */
export function sectionClassLabel(section?: SectionLike): string {
  if (!section) return '—';
  const gradeName = section.grade?.name?.trim() ?? '';
  const name = section.name?.trim() ?? '';
  if (gradeName && name) return `${gradeName} ${name}`;
  if (gradeName) return gradeName;
  return name || '—';
}
