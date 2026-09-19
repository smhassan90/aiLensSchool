import { apiClient } from "@/lib/api-client";
import type { ExamPaperSubmissionOverview } from "@/services/academics.service";
import type { PerformanceCriterion, TeacherScoreRow } from "@/services/teachers.service";
import type { Student360Data } from "@/components/students/student-360-view";

export type HeadTeacherBoardTeacher = {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
};

export type HeadTeacherBoardSection = {
  id: string;
  name: string;
  gradeId: string;
  gradeName: string;
  classLabel: string;
};

export type HeadTeacherBoardAssignment = {
  id: string;
  teacherId: string;
  title: string;
  teacherName: string;
  sections: HeadTeacherBoardSection[];
};

export type HeadTeacherBoard = {
  teachers: HeadTeacherBoardTeacher[];
  unassignedSections: HeadTeacherBoardSection[];
  assignments: HeadTeacherBoardAssignment[];
};

export type HeadTeacherAssignment = {
  id: string;
  title: string;
  sections: HeadTeacherBoardSection[];
};

export type HeadTeacherDashboard = {
  title: string;
  academicYear: { id: string; name: string } | null;
  sections: Array<{ id: string; classLabel: string }>;
  stats: {
    classes: number;
    students: number;
    teachers: number;
    attendanceRate: number | null;
    pendingExamPapers: number;
    recentQuizzes: number;
    recentHomework: number;
  };
};

export const headTeachersService = {
  getBoard() {
    return apiClient<HeadTeacherBoard>("/head-teachers/board");
  },

  saveBoard(assignments: Array<{ teacherId: string; title: string; sectionIds: string[] }>) {
    return apiClient<HeadTeacherBoard>("/head-teachers/board", {
      method: "PUT",
      body: { assignments },
    });
  },

  getMyAssignment() {
    return apiClient<HeadTeacherAssignment | null>("/head-teachers/me");
  },

  getDashboard() {
    return apiClient<HeadTeacherDashboard>("/head-teachers/me/dashboard");
  },

  getAttendance() {
    return apiClient<{
      since: string;
      summary: { classes: number; attendanceRate: number | null };
      classes: Array<{
        sectionId: string;
        classLabel: string;
        enrolled: number;
        records: number;
        attendanceRate: number | null;
      }>;
    }>("/head-teachers/me/attendance");
  },

  searchStudents(q: string) {
    return apiClient<{ students: Array<{ id: string; name: string; studentCode: string; className?: string; sectionName?: string }> }>(
      `/head-teachers/me/students/search?q=${encodeURIComponent(q)}`,
    );
  },

  getStudent(id: string) {
    return apiClient<Student360Data>(`/head-teachers/me/students/${id}`);
  },

  getTeacherProgress() {
    return apiClient<{ weights: PerformanceCriterion[]; teachers: TeacherScoreRow[] }>(
      "/head-teachers/me/teachers/progress",
    );
  },

  listQuizzes(params?: { sectionId?: string; teacherId?: string; subjectId?: string }) {
    const query = new URLSearchParams();
    if (params?.sectionId) query.set("sectionId", params.sectionId);
    if (params?.teacherId) query.set("teacherId", params.teacherId);
    if (params?.subjectId) query.set("subjectId", params.subjectId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiClient<{ items: Array<{ id: string; title: string; status: string; createdAt: string; subject?: { name: string }; classLabel?: string | null; teacherName: string; teacherId?: string | null }> }>(
      `/head-teachers/me/quizzes${suffix}`,
    );
  },

  listHomework(params?: { sectionId?: string; teacherId?: string; subjectId?: string }) {
    const query = new URLSearchParams();
    if (params?.sectionId) query.set("sectionId", params.sectionId);
    if (params?.teacherId) query.set("teacherId", params.teacherId);
    if (params?.subjectId) query.set("subjectId", params.subjectId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiClient<{ items: Array<{ id: string; title: string; dueDate: string; subject?: { name: string }; classLabel?: string | null; teacherName: string; teacherId?: string | null }> }>(
      `/head-teachers/me/homework${suffix}`,
    );
  },

  listResults(params?: { sectionId?: string; teacherId?: string; subjectId?: string }) {
    const query = new URLSearchParams();
    if (params?.sectionId) query.set("sectionId", params.sectionId);
    if (params?.teacherId) query.set("teacherId", params.teacherId);
    if (params?.subjectId) query.set("subjectId", params.subjectId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiClient<{
      quizResults: Array<{
        id: string;
        studentName: string;
        studentCode: string;
        quizTitle: string;
        subjectName?: string | null;
        classLabel?: string | null;
        percentage: number;
        submittedAt: string;
      }>;
      examResults: Array<{
        id: string;
        studentName: string;
        studentCode: string;
        examName: string;
        subjectName?: string | null;
        classLabel?: string | null;
        marksObtained: number;
        maxMarks: number;
        assessedAt: string;
      }>;
    }>(`/head-teachers/me/results${suffix}`);
  },

  getExamPaperSubmissions(params?: {
    examConfigId?: string;
    sectionId?: string;
    subjectId?: string;
    teacherId?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.examConfigId) query.set("examConfigId", params.examConfigId);
    if (params?.sectionId) query.set("sectionId", params.sectionId);
    if (params?.subjectId) query.set("subjectId", params.subjectId);
    if (params?.teacherId) query.set("teacherId", params.teacherId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiClient<ExamPaperSubmissionOverview>(`/head-teachers/me/exam-paper-submissions${suffix}`);
  },
};
