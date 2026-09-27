export type SchoolBrandingSnapshot = {
  id: string;
  name: string;
  logo?: string | null;
};

const KEY_PREFIX = "schoolBranding:";

export function readSchoolBrandingCache(schoolId: string): SchoolBrandingSnapshot | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${schoolId}`);
    if (!raw) return undefined;
    return JSON.parse(raw) as SchoolBrandingSnapshot;
  } catch {
    return undefined;
  }
}

export function writeSchoolBrandingCache(schoolId: string, data: SchoolBrandingSnapshot) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${schoolId}`, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}
