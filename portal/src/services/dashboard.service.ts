import { apiClient } from "@/lib/api-client";

export interface SchoolDashboardSummary {
  studentCount: number;
  teacherCount: number;
  classCount: number;
  feesCollectedThisMonth: number;
  feesRemainingThisMonth: number;
  feesOutstanding: number;
  setupCompleted: boolean;
  financeMonths: Array<{
    key: string;
    label: string;
    collected: number;
    expenseTotal: number;
    expenses: Record<string, number>;
  }>;
  expenseCategories: string[];
  classTeachers: Array<{
    sectionId: string;
    className: string;
    students: number;
    classTeacher: string | null;
    subjects: Array<{ subject: string; teacher: string }>;
  }>;
}

export interface TeacherDashboardSummary {
  classCount: number;
  quizCount: number;
  homeworkCount: number;
  quizTarget: number | null;
  missingLessonDays: number;
  missingAttendanceSlots: number;
  expectedLessonSlots?: number;
  doneLessonSlots?: number;
  expectedAttendanceSlots?: number;
  doneAttendanceSlots?: number;
  windowDays?: string[];
  lessonHeat?: number[];
  attendanceHeat?: number[];
  lessonByClass?: Array<{ label: string; done: number; expected: number; days?: boolean[] }>;
  attendanceByClass?: Array<{ label: string; done: number; expected: number; days?: boolean[] }>;
  watchQuizzes: string[];
  nextActions: string[];
  classes: Array<{
    sectionId: string;
    subjectId: string;
    academicYearId: string;
    branchId: string;
    sectionName: string;
    gradeName: string;
    gradeId?: string;
    subjectName: string;
    role: "TEACHER" | "ASSISTANT";
  }>;
  latestResults: Array<{
    id: string;
    percentage: number;
    student: { firstName: string; lastName: string };
    quiz: { title: string };
  }>;
}

export interface CoachCards {
  headline: string;
  verdict: "strong" | "mixed" | "needs_support";
  cards: Array<{ title: string; body: string; tone: "good" | "watch" | "act" }>;
  sayToTeacher: string;
}

export const dashboardService = {
  school() {
    return apiClient<SchoolDashboardSummary>("/dashboard/school");
  },
  teacher() {
    return apiClient<TeacherDashboardSummary>("/dashboard/teacher");
  },
  teacherCoach() {
    return apiClient<CoachCards>("/dashboard/teacher/coach", {
      method: "POST",
      body: JSON.stringify({}),
      cache: "no-store",
    });
  },
};
