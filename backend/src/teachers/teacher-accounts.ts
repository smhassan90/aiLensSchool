import { slugPart } from '../students/parent-accounts';

export function teacherLocalEmail(username: string, schoolCode: string): string {
  return `${username}@${slugPart(schoolCode) || 'school'}.teacher.local`;
}

/**
 * Login username from school code + employee code, e.g. tps.t0001 for TPS / TPS-0001.
 */
export function buildTeacherUsername(
  schoolCode: string,
  employeeCode: string,
  attempt = 0,
): string {
  const school = slugPart(schoolCode) || 'school';
  const code = employeeCode.trim();
  const trailing = /(\d+)$/.exec(code);
  const suffix = trailing ? trailing[1] : slugPart(code) || 'staff';
  const base = `${school}.t${suffix}`;
  return attempt ? `${base}.${attempt}` : base;
}
