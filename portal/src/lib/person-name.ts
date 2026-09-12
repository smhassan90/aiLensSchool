/** Import placeholders used when a person has only one name. */
export function isPlaceholderName(value?: string | null): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  return v === "-" || v === "—" || v === "." || lower === "n/a" || lower === "na" || lower === "none";
}

export function sanitizeLastName(value?: string | null): string {
  return isPlaceholderName(value) ? "" : (value ?? "").trim();
}

/** Build a person's display name without duplicating a missing last name. */
export function personFullName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const first = (firstName ?? "").trim();
  const last = sanitizeLastName(lastName);
  if (!first && !last) return "";
  if (!last || last.toLowerCase() === first.toLowerCase()) {
    return first || last;
  }
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
}

export function studentMatchesQuery(
  student: {
    firstName?: string | null;
    lastName?: string | null;
    studentCode?: string | null;
    admissionNumber?: string | null;
    grade?: { name?: string | null } | null;
    section?: { name?: string | null } | null;
    branch?: { name?: string | null } | null;
    parents?: Array<{
      parent?: {
        phone?: string | null;
        user?: { firstName?: string | null; lastName?: string | null; phone?: string | null } | null;
      } | null;
    }> | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = personFullName(student.firstName, student.lastName).toLowerCase();
  if (name.includes(q)) return true;
  const parentBits = (student.parents ?? []).flatMap((link) => [
    personFullName(link.parent?.user?.firstName, link.parent?.user?.lastName),
    link.parent?.phone,
    link.parent?.user?.phone,
  ]);
  const hay = [
    name,
    student.firstName,
    student.lastName,
    student.studentCode,
    student.admissionNumber,
    student.grade?.name,
    student.section?.name,
    student.branch?.name,
    ...parentBits,
  ]
    .map((value) => (value ?? "").toLowerCase())
    .join(" ");
  return q.split(/\s+/).every((token) => hay.includes(token));
}

type GenderLike = "MALE" | "FEMALE" | "OTHER" | string | null | undefined;

/** Teacher label with honorific: "Miss Saima" / "Mr. Daniyal". */
export function teacherDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  gender?: GenderLike,
): string {
  const name = personFullName(firstName, lastName);
  if (!name) return "";
  if (gender === "MALE") return `Mr. ${name}`;
  if (gender === "FEMALE") return `Miss ${name}`;
  return name;
}

export function teacherDisplayNameFromUser(
  user?: { firstName?: string | null; lastName?: string | null } | null,
  gender?: GenderLike,
): string {
  if (!user) return "—";
  return teacherDisplayName(user.firstName, user.lastName, gender) || "—";
}
