/** Import placeholders used when a person has only one name. */
export function isPlaceholderName(value?: string | null): boolean {
  const v = (value ?? '').trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  return v === '-' || v === '—' || v === '.' || lower === 'n/a' || lower === 'na' || lower === 'none';
}

export function sanitizeLastName(value?: string | null): string {
  return isPlaceholderName(value) ? '' : (value ?? '').trim();
}

/** Build a person's display name without duplicating a missing last name. */
export function personFullName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const first = (firstName ?? '').trim();
  const last = sanitizeLastName(lastName);
  if (!first && !last) return '';
  if (!last || last.toLowerCase() === first.toLowerCase()) {
    return first || last;
  }
  return `${first} ${last}`.replace(/\s+/g, ' ').trim();
}

type GenderLike = 'MALE' | 'FEMALE' | 'OTHER' | string | null | undefined;

/** Teacher label with honorific: "Miss Saima" / "Mr. Daniyal". */
export function teacherDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  gender?: GenderLike,
): string {
  const name = personFullName(firstName, lastName);
  if (!name) return '';
  if (gender === 'MALE') return `Mr. ${name}`;
  if (gender === 'FEMALE') return `Miss ${name}`;
  return name;
}
