import { randomBytes } from 'crypto';
import { ParentRelationship } from '@prisma/client';

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateParentPassword(length = 8): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => PASSWORD_CHARS[byte % PASSWORD_CHARS.length]).join('');
}

export function slugPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function buildParentUsername(
  schoolCode: string,
  relationship: ParentRelationship,
  studentCode: string,
  attempt = 0,
): string {
  const role = relationship === ParentRelationship.MOTHER ? 'm' : 'f';
  const base = `${slugPart(schoolCode)}.${role}.${slugPart(studentCode)}`;
  return attempt ? `${base}${attempt}` : base;
}

export function parentLocalEmail(username: string, schoolCode: string): string {
  return `${username}@${slugPart(schoolCode) || 'school'}.parent.local`;
}
