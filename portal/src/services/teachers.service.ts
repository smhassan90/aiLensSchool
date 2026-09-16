import { apiClient, buildQuery } from "@/lib/api-client";
import type {
  Paginated,
  Teacher,
  TeacherClass,
  TeacherClassAssignment,
} from "@/lib/types";

function mapClassAssignment(
  item: TeacherClassAssignment & {
    role?: "TEACHER" | "ASSISTANT" | "CLASS_TEACHER";
    isClassTeacher?: boolean;
  },
): TeacherClass {
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
    isClassTeacher: Boolean(item.isClassTeacher || item.role === "CLASS_TEACHER"),
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
  gender?: "MALE" | "FEMALE" | "OTHER";
  status?: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
}

export type UpdateTeacherPayload = Partial<Omit<CreateTeacherPayload, "password">>;

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

export type TeacherAttendanceStatus = "PRESENT" | "LATE" | "ABSENT";

export interface TeacherAttendancePolicy {
  lateAfter: string;
  absentAfter: string;
  timezone: string;
}

export interface TeacherAttendanceRow {
  teacherId: string;
  name: string;
  employeeCode: string;
  status: TeacherAttendanceStatus | null;
  checkedInAt: string | null;
  source: string | null;
}

export interface TeacherAttendanceDay {
  date: string;
  policy: TeacherAttendancePolicy;
  teachers: TeacherAttendanceRow[];
  summary: { present: number; late: number; absent: number; waiting: number };
}

export interface TeacherCheckInResult {
  teacherId: string;
  date: string;
  checkedInAt: string;
  status: TeacherAttendanceStatus;
  source: string;
  alreadyCheckedIn: boolean;
}

export const teachersService = {
  myClasses() {
    return apiClient<TeacherClassAssignment[]>("/teachers/me/classes").then((items) =>
      items.map(mapClassAssignment),
    );
  },

  list(params?: { page?: number; limit?: number; search?: string; branchId?: string; status?: string }) {
    return apiClient<Paginated<Teacher>>(`/teachers${buildQuery(params ?? {})}`);
  },

  create(payload: CreateTeacherPayload) {
    return apiClient<Teacher>("/teachers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: string, payload: UpdateTeacherPayload) {
    return apiClient<Teacher>(`/teachers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  getById(id: string) {
    return apiClient<Teacher>(`/teachers/${id}`, { cache: "no-store" });
  },

  performance(id: string) {
    return apiClient<TeacherScoreRow>(`/teachers/${id}/performance`);
  },

  scoreboard() {
    return apiClient<TeacherScoreboard>("/teachers/scoreboard", { cache: "no-store" });
  },

  listAttendance(date: string) {
    return apiClient<TeacherAttendanceDay>(`/teachers/attendance${buildQuery({ date })}`);
  },

  updateAttendancePolicy(payload: { teacherLateAfter: string; teacherAbsentAfter: string }) {
    return apiClient<TeacherAttendancePolicy>("/teachers/attendance/policy", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  checkIn(teacherId: string) {
    return apiClient<TeacherCheckInResult>("/teachers/attendance/check-in", {
      method: "POST",
      body: JSON.stringify({ teacherId }),
    });
  },

  coach(id: string) {
    return apiClient<TeacherCoachResult>(`/teachers/${id}/coach`, {
      method: "POST",
      body: JSON.stringify({}),
      cache: "no-store",
    });
  },

  resetPassword(id: string) {
    return apiClient<{
      teacherId: string;
      username: string | null;
      temporaryPassword: string;
      mustChangePassword: boolean;
    }>(`/teachers/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};
