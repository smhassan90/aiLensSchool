import { apiClient, buildQuery } from "@/lib/api-client";
import type { ExamPaperQuestionSpec } from "@/lib/exam-paper-question-spec";
import type {
  AcademicYear,
  ClassSubject,
  Enrollment,
  Grade,
  Paginated,
  Quiz,
  Section,
  Subject,
} from "@/lib/types";

export type ExamPaperSubmissionPaper = Quiz & {
  teacherName?: string;
  teacherGender?: string | null;
  reviewStatus?: string;
  rejectionReason?: string | null;
};

export interface ExamPaperSubmissionOverview {
  academicYear: { id: string; name: string } | null;
  submissionDaysBefore: number;
  selectedExam: {
    id: string;
    name: string;
    examDate: string | null;
    deadline: string | null;
  } | null;
  submitted: number;
  expected: number;
  exams: Array<{ id: string; name: string; startDate?: string | null; sequence: number }>;
  filters: {
    sections: Array<{ id: string; name: string }>;
    subjects: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; name: string }>;
  };
  teachers: Array<{
    teacherId: string;
    teacherName: string;
    gender: string | null;
    submittedCount: number;
    expectedCount: number;
    assignments: Array<{
      sectionId: string;
      subjectId: string;
      className: string;
      subjectName: string;
      status: "SUBMITTED" | "DRAFT" | "MISSING" | "REJECTED";
      reviewStatus?: string | null;
      paperId: string | null;
      submittedAt: string | null;
    }>;
  }>;
  papers: ExamPaperSubmissionPaper[];
}

export interface CreateYearPayload {
  name: string;
  startDate: string;
  endDate: string;
  branchId?: string;
  isCurrent?: boolean;
}

export interface CreateClassPayload {
  name: string;
  level: number;
  createDefaultSection?: boolean;
  branchId?: string;
  defaultSectionName?: string;
  defaultSectionCapacity?: number;
  stageId?: string;
  admissionFee?: number;
  tuitionFee?: number;
}

export interface UpdateClassPayload {
  name?: string;
  level?: number;
  stageId?: string | null;
  admissionFee?: number | null;
  tuitionFee?: number | null;
}

export interface SchoolStage {
  id: string;
  name: string;
  sortOrder?: number;
  grades?: Array<{ id: string; name: string; level: number; tuitionFee?: string | number | null }>;
  _count?: { grades: number };
}

export interface CreateSectionPayload {
  name: string;
  branchId: string;
  gradeId: string;
  capacity?: number;
}

export interface CreateSubjectPayload {
  name: string;
  code: string;
  gradeId?: string;
}

export interface CreateEnrollmentPayload {
  studentId: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  enrollmentDate?: string;
}

export interface AssignTeacherPayload {
  sectionId: string;
  subjectId: string;
  academicYearId: string;
  branchId: string;
  teacherId?: string;
  assistantTeacherId?: string;
}

export const academicsService = {
  listYears(params?: { page?: number; limit?: number }) {
    return apiClient<Paginated<AcademicYear>>(`/academics/years${buildQuery(params ?? {})}`);
  },

  listStages() {
    return apiClient<SchoolStage[]>("/academics/stages");
  },

  createStage(payload: { name: string; sortOrder?: number; coordinatorId?: string }) {
    return apiClient<SchoolStage>("/academics/stages", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateStage(id: string, payload: { name?: string; sortOrder?: number; coordinatorId?: string | null }) {
    return apiClient<SchoolStage>(`/academics/stages/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  createYear(payload: CreateYearPayload) {
    return apiClient<AcademicYear>("/academics/years", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listGrades(params?: { page?: number; limit?: number }) {
    return apiClient<Paginated<Grade>>(`/academics/grades${buildQuery(params ?? {})}`);
  },

  getGrade(id: string) {
    return apiClient<Grade>(`/academics/grades/${id}`);
  },

  createGrade(payload: CreateClassPayload) {
    return apiClient<Grade>("/academics/grades", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateGrade(id: string, payload: UpdateClassPayload) {
    return apiClient<Grade>(`/academics/grades/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  listSections(params?: { page?: number; limit?: number; branchId?: string; gradeId?: string }) {
    return apiClient<Paginated<Section>>(`/academics/sections${buildQuery(params ?? {})}`);
  },

  async getSection(id: string) {
    try {
      return await apiClient<Section>(`/academics/sections/${id}`);
    } catch {
      const listed = await academicsService.listSections({ limit: 100 });
      const found = listed.items.find((section) => section.id === id);
      if (!found) throw new Error("Class section not found");
      return found;
    }
  },

  createSection(payload: CreateSectionPayload) {
    return apiClient<Section>("/academics/sections", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listSubjects(params?: { page?: number; limit?: number; gradeId?: string }) {
    return apiClient<Paginated<Subject>>(`/academics/subjects${buildQuery(params ?? {})}`);
  },

  listBooks(params?: { page?: number; limit?: number }) {
    return apiClient<Paginated<{
      id: string;
      name: string;
      publisher?: string | null;
      subject?: { id: string; name: string };
      grade?: { id: string; name: string };
    }>>(`/curriculum${buildQuery(params ?? {})}`);
  },

  createSubject(payload: CreateSubjectPayload) {
    return apiClient<Subject>("/academics/subjects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listEnrollments(params?: {
    page?: number;
    limit?: number;
    sectionId?: string;
    academicYearId?: string;
    gradeId?: string;
    status?: string;
  }) {
    return apiClient<Paginated<Enrollment>>(`/academics/enrollments${buildQuery(params ?? {})}`);
  },

  createEnrollment(payload: CreateEnrollmentPayload) {
    return apiClient<Enrollment>("/academics/enrollments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listClassSubjects(params?: {
    page?: number;
    limit?: number;
    sectionId?: string;
    academicYearId?: string;
    gradeId?: string;
  }) {
    return apiClient<Paginated<ClassSubject>>(`/academics/class-subjects${buildQuery(params ?? {})}`);
  },

  assignClassSubject(payload: AssignTeacherPayload) {
    return apiClient<ClassSubject>("/academics/class-subjects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  setClassTeacher(sectionId: string, classTeacherId: string | null) {
    return apiClient(`/academics/sections/${sectionId}/class-teacher`, {
      method: "POST",
      body: JSON.stringify({ classTeacherId }),
    });
  },

  saveExamPattern(payload: {
    academicYearId: string;
    pattern: string;
    examSubmissionDaysBefore?: number;
    exams?: Array<{ name: string; maxMarks: number; sequence: number; startDate?: string; endDate?: string }>;
  }) {
    return apiClient("/academics/exam-configs", { method: "POST", body: JSON.stringify(payload) });
  },

  getExamSettings() {
    return apiClient<{ examSubmissionDaysBefore: number }>("/academics/exam-settings");
  },

  listExamConfigs(academicYearId?: string) {
    return apiClient<Array<{
      id: string;
      name: string;
      sequence: number;
      maxMarks: number;
      academicYearId: string;
      startDate?: string | null;
      endDate?: string | null;
    }>>(`/academics/exam-configs${buildQuery({ academicYearId })}`);
  },

  listExamPaperAssignments(examConfigId: string) {
    return apiClient<{
      exam: { id: string; name: string; maxMarks: number; academicYearId: string; startDate?: string | null };
      defaultDueAt: string | null;
      targetCount: number;
      rows: Array<{
        sectionId: string;
        subjectId: string;
        className: string;
        subjectName: string;
        defaultTeacherId: string | null;
        defaultTeacherUserId: string | null;
        defaultTeacherName: string;
        assignment: {
          id: string;
          teacherId: string | null;
          maxMarks: number;
          submissionDueAt: string;
          scoreEntryDueAt: string | null;
          questionSpec: ExamPaperQuestionSpec | null;
          releasedAt: string | null;
        } | null;
      }>;
    }>(`/academics/exam-paper-assignments${buildQuery({ examConfigId })}`);
  },

  saveExamPaperAssignments(payload: {
    examConfigId: string;
    release?: boolean;
    applyToAll?: boolean;
    maxMarks?: number;
    submissionDueAt?: string;
    scoreEntryDueAt?: string;
    examDate?: string;
    questionSpec?: ExamPaperQuestionSpec | null;
    rows?: Array<{
      sectionId: string;
      subjectId: string;
      teacherId?: string | null;
      maxMarks: number;
      submissionDueAt: string;
      enabled?: boolean;
    }>;
  }) {
    return apiClient<{ saved: number; released: boolean }>("/academics/exam-paper-assignments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listMyExamPaperAssignments() {
    return apiClient<{
      pendingCount: number;
      assignments: Array<{
        id: string;
        examConfigId: string;
        examName: string;
        examDate: string | null;
        sectionId: string;
        subjectId: string;
        className: string;
        sectionName: string;
        gradeLevel: number;
        subjectName: string;
        maxMarks: number;
        submissionDueAt: string;
        scoreEntryDueAt: string | null;
        scoresSubmitted: boolean;
        paperSubmissionOpen: boolean;
        scoreEntryOpen: boolean;
        questionSpec: ExamPaperQuestionSpec | null;
        releasedAt: string | null;
        status: "NOT_STARTED" | "DRAFT" | "PENDING" | "APPROVED";
        quizId: string | null;
        rejectionReason: string | null;
        pendingGeneration: boolean;
        paperExtensionRequest: { id: string; days: number; status: "PENDING" } | null;
        scoreExtensionRequest: { id: string; days: number; status: "PENDING" } | null;
      }>;
    }>("/academics/my-exam-paper-assignments");
  },

  requestExamDeadlineExtension(payload: {
    assignmentId: string;
    kind: "paper" | "score";
    days: 1 | 2 | 3;
  }) {
    return apiClient<{
      id: string;
      status: string;
      days: number;
      examName: string;
      className: string;
      subjectName: string;
    }>("/academics/exam-deadline-extension-requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listExamDeadlineExtensionRequests() {
    return apiClient<
      Array<{
        id: string;
        kind: "PAPER" | "SCORE" | "BOTH";
        days: number;
        requestedAt: string;
        teacherUserId: string;
        teacherName: string;
        examConfigId: string;
        examName: string;
        sectionId: string;
        subjectId: string;
        className: string;
        subjectName: string;
        assignmentId: string;
      }>
    >("/academics/exam-deadline-extension-requests");
  },

  approveExamDeadlineExtensionRequest(id: string, days?: 1 | 2 | 3) {
    return apiClient<{ ok: boolean; unlockedUntil: string; assignmentCount: number; teacherName: string }>(
      `/academics/exam-deadline-extension-requests/${id}/approve`,
      { method: "POST", body: JSON.stringify(days ? { days } : {}) },
    );
  },

  setExamConfigDate(examConfigId: string, examDate: string) {
    return apiClient<{ id: string; name: string; startDate: string | null }>(
      `/academics/exam-configs/${examConfigId}/date`,
      { method: "PATCH", body: JSON.stringify({ examDate }) },
    );
  },

  listTeacherExamExtensionOptions(teacherUserId: string) {
    return apiClient<{
      exams: Array<{ id: string; name: string; startDate: string | null; maxMarks: number }>;
    }>(`/academics/teachers/${teacherUserId}/exam-extension-options`);
  },

  extendExamDeadlines(payload: {
    teacherUserId: string;
    examConfigId: string;
    kind: "paper" | "score" | "both";
    days: 1 | 2 | 3;
  }) {
    return apiClient<{ ok: boolean; unlockedUntil: string; assignmentCount: number; teacherName: string }>(
      "/academics/exam-deadline-extensions",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  getExamScoreSheet(params: { examConfigId: string; sectionId: string; subjectId: string }) {
    return apiClient<{
      exam: { id: string; name: string; maxMarks: number; examDate: string | null };
      className: string;
      subjectName: string;
      scoreEntryDueAt: string | null;
      scoresSubmitted: boolean;
      canEnterScores: boolean;
      students: Array<{
        studentId: string;
        firstName: string;
        lastName: string;
        studentCode: string;
        marks: number | null;
        assessmentId: string | null;
      }>;
    }>(`/academics/exam-score-sheet${buildQuery(params)}`);
  },

  saveExamScores(payload: {
    examConfigId: string;
    sectionId: string;
    subjectId: string;
    scores: Array<{ studentId: string; marks: number }>;
  }) {
    return apiClient<{ saved: number }>("/academics/exam-scores", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getExamPaperSubmissions(params?: {
    examConfigId?: string;
    sectionId?: string;
    subjectId?: string;
    subjectName?: string;
    teacherId?: string;
  }) {
    return apiClient<ExamPaperSubmissionOverview>(
      `/academics/exam-paper-submissions${buildQuery(params ?? {})}`,
    );
  },

  listTimetable(gradeId?: string) {
    return apiClient<{
      academicYear: { id: string; name: string } | null;
      grades?: Array<{ id: string; name: string }>;
      grade: {
        id: string;
        name: string;
        hasPeriodTimetable?: boolean;
        stage?: { id: string; name: string } | null;
      } | null;
      section: {
        id: string;
        name: string;
        classTeacher?: { id: string; user: { firstName: string; lastName: string } } | null;
      } | null;
      pattern?: "WEEKLY" | "CLASS_TEACHER";
      subjects?: Array<{
        id: string;
        name: string;
        teacher?: { id: string; user: { firstName: string; lastName: string } } | null;
      }>;
      slots: Array<{
        weekday: string;
        periodNumber: number;
        startTime?: string | null;
        endTime?: string | null;
        title: string;
        subject?: { id: string; name: string } | null;
        teacher?: { id: string; user: { firstName: string; lastName: string } } | null;
      }>;
    }>(`/academics/timetable${buildQuery({ gradeId })}`);
  },

  listQuizTargets() {
    return apiClient<Array<{
      id: string;
      gradeId: string;
      subjectId: string;
      minQuizzes: number;
      grade?: { name: string };
      subject?: { name: string };
    }>>("/academics/quiz-targets");
  },

  saveQuizTarget(payload: { gradeId?: string; subjectId?: string; minQuizzes: number }) {
    return apiClient<{ minQuizzes: number; gradeCount: number; subjectCount: number; savedCount: number }>(
      "/academics/quiz-targets",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  addAssessment(payload: {
    studentId: string;
    subjectId: string;
    sectionId: string;
    academicYearId: string;
    examConfigId?: string;
    type: string;
    title: string;
    maxMarks: number;
    marks: number;
  }) {
    return apiClient("/academics/assessments", { method: "POST", body: JSON.stringify(payload) });
  },

  listAssessments(params?: { sectionId?: string; subjectId?: string; examConfigId?: string }) {
    return apiClient<Array<{
      id: string;
      title: string;
      type: string;
      marks: number;
      maxMarks: number;
      studentId: string;
      studentCode?: string;
      student?: { firstName: string; lastName: string };
      subject?: { name: string };
    }>>(`/academics/assessments${buildQuery(params ?? {})}`);
  },
};
