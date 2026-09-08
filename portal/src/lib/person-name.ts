/** Build a person's display name without duplicating a missing last name. */
export function personFullName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (!first && !last) return "";
  if (!last || last === "-" || last.toLowerCase() === first.toLowerCase()) {
    return first || last;
  }
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
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
