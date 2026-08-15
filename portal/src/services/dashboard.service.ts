import { apiClient } from "@/lib/api-client";

export interface SchoolDashboardClass {
  id: string;
  name: string;
  level: number;
  _count: { sections: number; enrollments: number };
}

export interface DashboardResultRow {
  id: string;
  percentage: number;
  student: { firstName: string; lastName: string };
  quiz: { title: string };
}

export interface SchoolDashboardSummary {
  studentCount: number;
  teacherCount: number;
  classCount: number;
  feesOutstanding: number;
  classes: SchoolDashboardClass[];
  latestResults: DashboardResultRow[];
}

export interface TeacherDashboardClass {
  sectionId: string;
  subjectId: string;
  academicYearId: string;
  branchId: string;
  sectionName: string;
  gradeName: string;
  gradeId?: string;
  subjectName: string;
  role: "TEACHER" | "ASSISTANT";
}

export interface TeacherDashboardSummary {
  classCount: number;
  quizCount: number;
  homeworkCount: number;
  classes: TeacherDashboardClass[];
  latestResults: DashboardResultRow[];
}

export const dashboardService = {
  school() {
    return apiClient<SchoolDashboardSummary>("/dashboard/school");
  },
  teacher() {
    return apiClient<TeacherDashboardSummary>("/dashboard/teacher");
  },
};
