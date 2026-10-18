export const LIBRARY_CLASSES = Array.from({ length: 12 }, (_, index) => `Class ${index + 1}`);

export const LIBRARY_SUBJECTS = [
  "Mathematics",
  "English",
  "Urdu",
  "Sindhi",
  "Islamiat",
  "Pakistan Studies",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "General Science",
];

export const LIBRARY_LANGUAGES = ["English", "Urdu", "Sindhi"] as const;

export function optionsWithCurrent(options: string[], current?: string | null) {
  const value = (current ?? "").trim();
  if (!value || options.includes(value)) return options;
  return [value, ...options];
}
