import {
  buildParentUsername,
  parentPhoneDigits,
  slugPart,
} from '../students/parent-accounts';

export function teacherLocalEmail(username: string, schoolCode: string): string {
  return `${username}@${slugPart(schoolCode) || 'school'}.teacher.local`;
}

/** Login username: school code + mobile digits, e.g. tps.032123234543 (same pattern as parent app). */
export function buildTeacherUsername(
  schoolCode: string,
  phone: string,
  attempt = 0,
): string {
  return buildParentUsername(schoolCode, phone, attempt);
}

export function normalizeTeacherPhoneDigits(phone: string): string {
  return parentPhoneDigits(phone);
}

export function schoolPhonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const da = parentPhoneDigits(a ?? '');
  const db = parentPhoneDigits(b ?? '');
  return da.length > 0 && da === db;
}
