export const PERFORMANCE_WEIGHTS = {
  annualResults: 25,
  lessons: 20,
  quizzesCreated: 15,
  teacherAttendance: 15,
  quizCompletion: 10,
  quizMarks: 8,
  studentAttendance: 7,
} as const;

export type ScoreKey = keyof typeof PERFORMANCE_WEIGHTS;

export const PERFORMANCE_CRITERIA: Array<{
  key: ScoreKey;
  label: string;
  points: number;
  why: string;
}> = [
  {
    key: 'annualResults',
    label: 'Annual / term results',
    points: 25,
    why: 'This is what families judge the school on. It should weigh most.',
  },
  {
    key: 'lessons',
    label: 'Lessons uploaded',
    points: 20,
    why: 'If the lesson is not on the system, parents cannot follow the class.',
  },
  {
    key: 'quizzesCreated',
    label: 'Quizzes created',
    points: 15,
    why: 'No quiz means parents are not engaged and students are not practising.',
  },
  {
    key: 'teacherAttendance',
    label: 'Teacher attendance',
    points: 15,
    why: 'Admin marks this. Being present is a fair professional standard.',
  },
  {
    key: 'quizCompletion',
    label: 'Quiz completion',
    points: 10,
    why: 'Shows whether students in this teacher’s subject actually attempt the work.',
  },
  {
    key: 'quizMarks',
    label: 'Quiz marks',
    points: 8,
    why: 'Good scores in this subject show the teaching is landing.',
  },
  {
    key: 'studentAttendance',
    label: 'Student attendance',
    points: 7,
    why: 'Often a home issue, not the teacher’s fault — still raise it in the meeting.',
  },
];

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function weightedTotal(scores: Record<ScoreKey, number | null>) {
  let earned = 0;
  let weight = 0;
  for (const key of Object.keys(PERFORMANCE_WEIGHTS) as ScoreKey[]) {
    const score = scores[key];
    if (score == null) continue;
    const pts = PERFORMANCE_WEIGHTS[key];
    earned += (score / 100) * pts;
    weight += pts;
  }
  if (!weight) return 0;
  return Math.round((earned / weight) * 1000) / 10;
}

export function weekdaysSince(from: Date, to = new Date()) {
  const days: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
