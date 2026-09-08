/** Default parent password; must be changed on first login. */
export const DEFAULT_PARENT_PASSWORD = 'Password123';

export function generateParentPassword(): string {
  return DEFAULT_PARENT_PASSWORD;
}

export function slugPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Digits only — keeps leading 0 (e.g. 032123234543). */
export function parentPhoneDigits(phone?: string | null): string {
  return (phone ?? '').replace(/\D/g, '');
}

/**
 * Parent login: school initials + phone, e.g. tps.032123234543
 */
export function buildParentUsername(schoolCode: string, phone?: string | null, attempt = 0): string {
  const school = slugPart(schoolCode) || 'school';
  const digits = parentPhoneDigits(phone);
  const base = digits ? `${school}.${digits}` : `${school}.parent`;
  return attempt ? `${base}.${attempt}` : base;
}

export function parentLocalEmail(username: string, schoolCode: string): string {
  return `${username}@${slugPart(schoolCode) || 'school'}.parent.local`;
}
