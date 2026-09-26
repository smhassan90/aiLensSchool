export function normalizeSchoolPrefix(schoolCode: string): string {
  const cleaned = schoolCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, 12) || 'SCH';
}

/** Next school-wide sequential identifier from existing values (uses largest numeric part + 1). */
export function nextSequentialIdentifier(existingValues: string[]): string {
  let max = 0;
  for (const raw of existingValues) {
    const value = raw.trim();
    if (!value) continue;
    const trailing = /(\d+)$/.exec(value);
    if (trailing) {
      max = Math.max(max, Number.parseInt(trailing[1], 10));
      continue;
    }
    const digits = value.replace(/\D/g, '');
    if (digits) {
      max = Math.max(max, Number.parseInt(digits, 10));
    }
  }
  const next = max + 1;
  const width = Math.max(4, String(next).length);
  return String(next).padStart(width, '0');
}

/** e.g. TPS-0001 from school code TPS and existing teacher employee codes. */
export function nextPrefixedSequentialIdentifier(
  schoolCode: string,
  existingValues: string[],
): string {
  const prefix = normalizeSchoolPrefix(schoolCode);
  const suffixes: string[] = [];
  for (const raw of existingValues) {
    const value = raw.trim();
    if (!value.toUpperCase().startsWith(prefix)) continue;
    const rest = value.slice(prefix.length).replace(/^[-_]/, '');
    if (rest) suffixes.push(rest);
  }
  const next = nextSequentialIdentifier(suffixes);
  return `${prefix}-${next}`;
}
