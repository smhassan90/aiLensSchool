import { apiClient, buildQuery } from "@/lib/api-client";
import type {
  Paginated,
  Teacher,
  TeacherClass,
  TeacherClassAssignment,
} from "@/lib/types";

function mapClassAssignment(item: TeacherClassAssignment & { role?: "TEACHER" | "ASSISTANT" }): TeacherClass {
  return {
    sectionId: item.sectionId,
    sectionName: item.section?.name ?? "—",
    gradeName: item.section?.grade?.name ?? "—",
    gradeId: item.section?.grade?.id,
    subjectId: item.subjectId,
    subjectName: item.subject?.name ?? "—",
    academicYearId: item.academicYearId,
    branchId: item.branchId,
    role: item.role,
  };
}

export interface CreateTeacherPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  branchId: string;
  employeeCode: string;
  hireDate?: string;
}

export type ScoreKey =
  | "annualResults"
  | "lessons"
  | "quizzesCreated"
  | "teacherAttendance"
  | "quizCompletion"
  | "quizMarks"
  | "studentAttendance";

export interface PerformanceCriterion {
  key: ScoreKey;
  label: string;
  points: number;
  why: string;
}

export interface TeacherScoreRow {
  teacher: { id: string; name: string };
  total: number;
  rank?: number;
  scores: Record<ScoreKey, number | null>;
  metrics: {
    lessons: { done: number; expected: number };
    quizzes: {
      created: number;
      target: number;
      completion: number | null;
      goodMarks: number | null;
      average: number | null;
    };
    annual: { average: number | null; source: string };
    teacherAttendance: { present: number; marked: number };
    studentAttendance: { rate: number | null; records: number };
  };
  byClass: Array<{
    className: string;
    subject: string;
    sectionId: string;
    subjectId: string;
    lessons: number;
    quizzes: number;
    attempts: number;
    enrolled: number;
    quizAverage: number | null;
    termAverage: number | null;
    studentAttendance: number | null;
  }>;
  last30Days?: { lessonsAdded: number; attendanceDaysMarked: number };
  classTeacherOf?: string[];
}

export interface TeacherScoreboard {
  weights: PerformanceCriterion[];
  teachers: TeacherScoreRow[];
}

export interface TeacherCoaching {
  headline: string;
  verdict: string;
  cards: Array<{ title: string; body: string; tone: string }>;
  strengths: string[];
  improvements: string[];
  discussTonight: string[];
  sayToTeacher: string;
}

export interface TeacherCoachResult {
  performance: TeacherScoreRow;
  coaching: TeacherCoaching;
}

export interface TeacherAttendanceRow {
  teacherId: string;
  name: string;
  employeeCode: string;
  status: "PRESENT" | "ABSENT";
}

export const teachersService = {
  myClasses() {
    return apiClient<TeacherClassAssignment[]>("/teachers/me/classes").then((items) =>
      items.map(mapClassAssignment),
    );
  },

  list(params?: { page?: number; limit?: number; search?: string; branchId?: string }) {
    return apiClient<Paginated<Teacher>>(`/teachers${buildQuery(params ?? {})}`);
  },

  create(payload: CreateTeacherPayload) {
    return apiClient<Teacher>("/teachers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getById(id: string) {
    return apiClient<Teacher>(`/teachers/${id}`);
  },

  performance(id: string) {
    return apiClient<TeacherScoreRow>(`/teachers/${id}/performance`);
  },

  scoreboard() {
    return apiClient<TeacherScoreboard>("/teachers/scoreboard", { cache: "no-store" });
  },

  listAttendance(date: string) {
    return apiClient<TeacherAttendanceRow[]>(`/teachers/attendance${buildQuery({ date })}`);
  },

  markAttendance(payload: {
    date: string;
    entries: Array<{ teacherId: string; status: "PRESENT" | "ABSENT" }>;
  }) {
    return apiClient<{ saved: number }>("/teachers/attendance", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  coach(id: string) {
    return apiClient<TeacherCoachResult>(`/teachers/${id}/coach`, {
      method: "POST",
      body: JSON.stringify({}),
      cache: "no-store",
    });
  },
};
