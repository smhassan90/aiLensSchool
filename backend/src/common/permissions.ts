export const STAFF_PERMISSIONS = [
  { key: 'VIEW_DASHBOARD', label: 'School dashboard', hint: 'See students, fees and what is happening today' },
  { key: 'SEARCH_STUDENTS', label: 'Find a child', hint: 'Search by student ID, parent name or phone' },
  { key: 'VIEW_TEACHER_PROGRESS', label: 'Teacher progress', hint: 'Punctuality, quizzes and AI coaching notes' },
  { key: 'VIEW_FINANCE', label: 'Fees & money', hint: 'Collected vs remaining, and expense charts' },
  { key: 'MANAGE_TEACHERS', label: 'Add teachers', hint: 'Create teacher logins' },
  { key: 'MANAGE_CLASSES', label: 'Classes & sections', hint: 'Create class, section, class teacher' },
  { key: 'MANAGE_STAFF', label: 'Staff accounts', hint: 'Create principal or staff with selected access' },
  { key: 'MANAGE_EXPENSES', label: 'Salaries & bills', hint: 'Teacher salary, electricity, repairs' },
  { key: 'MANAGE_EXAMS', label: 'Exam pattern', hint: 'Mid/final or term exams and max marks' },
  { key: 'GENERATE_REPORT_CARDS', label: 'Report cards', hint: 'Generate student report cards' },
  { key: 'SET_QUIZ_TARGETS', label: 'Quiz minimums', hint: 'How many quizzes each class/subject needs' },
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]['key'];

export const PRINCIPAL_DEFAULT_PERMISSIONS: StaffPermission[] = [
  'VIEW_DASHBOARD',
  'SEARCH_STUDENTS',
  'VIEW_TEACHER_PROGRESS',
  'VIEW_FINANCE',
];

export function parsePermissions(raw: unknown): StaffPermission[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(STAFF_PERMISSIONS.map((item) => item.key));
  return raw.filter((item): item is StaffPermission => typeof item === 'string' && allowed.has(item as StaffPermission));
}

export function hasStaffPermission(
  roles: string[] | undefined,
  permissions: StaffPermission[] | undefined,
  needed: StaffPermission,
): boolean {
  if (roles?.includes('SUPER_ADMIN') || roles?.includes('SCHOOL_ADMIN')) return true;
  return Boolean(permissions?.includes(needed));
}
