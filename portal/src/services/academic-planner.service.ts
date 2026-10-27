import { apiClient, buildQuery } from "@/lib/api-client";



export type StageSegment = {

  stage: string;

  minutes: number;

  portionKey?: string;

  activityKey?: string;

  part?: number;

  partCount?: number;

};



export type PlannerSettings = {

  revisionSlots: number;

  minRevisionSlots: number;

  minChapterStartMinutes: number;

  fallbackPeriodsPerWeek?: number;

  fallbackPeriodMinutes?: number;

  lastTeachingDate: string;

};



export type ScheduleSummary = {

  totalSlots: number;

  teachingSlots: number;

  revisionSlots: number;

  usedSlots: number;

  slackSlots: number;

  requiredMinutes: number;

  capacityMinutes: number;

  unscheduledLessonCount: number;

  predictedCompletionDate: string | null;

  feasibility: "FEASIBLE" | "AT_RISK" | "INFEASIBLE";

  shortfallMinutes: number;

  alternatives: Array<{

    code: string;

    detail: string;

    recoversMinutes?: number;

    earliestFeasibleExamDate?: string;

  }>;

  warnings: Array<{ code: string; message: string; chapterKey?: string; lessonKey?: string }>;

  timetableSource: "VERSIONED" | "LEGACY" | "FALLBACK";

};



export type PlannerVersionPayload = {

  planner: {

    id: string;

    title: string;

    status: string;

    sectionId: string;

    classLabel: string;

    subject: { id: string; name: string };

    teacher: { id: string; name: string };

    examType: string;

    examDate: string;

    startDate: string;

    approvedVersionId: string | null;

    workingVersionId: string | null;

    lockRevision: number;

    libraryBook: { id: string; title: string } | null;

  };

  version: {

    id: string;

    versionNumber: number;

    status: string;

    origin: string;

    revision: number;

    basedOnVersionId: string | null;

    settings: PlannerSettings;

    summary: ScheduleSummary | null;

    examRisk: string | null;

    changeReason: string | null;

    changeReasonNote: string | null;

    impact: unknown;

    submittedAt: string | null;

    decidedAt: string | null;

    decisionComment: string | null;

    createdById: string;

  };

  permissions: {

    canEdit: boolean;

    canSubmit: boolean;

    canWithdraw: boolean;

    canDecide: boolean;

    canPublishDirectly: boolean;

    canCreateRevision: boolean;

    canRequestRecovery: boolean;

    canRegenerateRecovery: boolean;

    canRecord: boolean;

  };

  chapters: Array<Record<string, unknown>>;

  activities: Array<Record<string, unknown>>;

  lessons: Array<{

    lessonKey: string;

    chapterKey: string | null;

    sequence: number;

    kind: string;

    title: string;

    primaryStage: string;

    stages: StageSegment[];

    objectives: string[];

    plannedMinutes: number;

    dependsOnKeys: string[];

    date: string | null;

    periodNumber: number | null;

    startTime: string | null;

    endTime: string | null;

    frozen: boolean;

    isContinuation: boolean;

    progress: unknown;

  }>;

  calendar: {

    from: string;

    to: string;

    lastTeachingDate: string;

    examDate: string;

    days: Array<{

      date: string;

      working: boolean;

      reason: string | null;

      slots: Array<{

        periodNumber: number;

        startTime: string;

        endTime: string;

        minutes: number;

        reserved?: "REVISION";

      }>;

    }>;

  };

  warnings: ScheduleSummary["warnings"];

};



export type PlannerListItem = {

  id: string;

  title: string;

  status: string;

  classLabel: string;

  subjectName: string;

  teacherName: string;

  examDate: string;

  sectionId: string;

  subjectId: string;

  workingVersionId: string | null;

  workingVersionStatus: string | null;

};



export type PlannerOptions = {

  section: { id: string; label: string; gradeHasPeriodTimetable: boolean };

  subject: { id: string; name: string };

  eligibleTeachers: Array<{ id: string; name: string }>;

  grantedBooks: Array<{

    id: string;

    title: string;

    classLabel: string;

    subjectLabel: string;

    suggested: boolean;

  }>;

  examConfigs: Array<{ id: string; name: string; startDate: string | null }>;

  timetable: { source: string; periodsPerWeek: number | null; typicalMinutes: number | null } | null;

  overlappingPlanners: Array<{ id: string; title: string; status: string }>;

};



export type PlannerBookChapter = {

  id: string;

  chapterNumber: number | null;

  title: string;

  hasContent: boolean;

  wordCount: number;

};



export type CreatePlannerInput = {

  sectionId: string;

  subjectId: string;

  teacherId: string;

  examType: "ASSESSMENT" | "MIDTERM" | "FINAL_TERM";

  examConfigId?: string;

  examDate: string;

  startDate?: string;

  libraryBookId: string;

  chapterIds: string[];

  settings?: {

    revisionSlots?: number;

    fallbackPeriodsPerWeek?: number;

    fallbackPeriodMinutes?: number;

    minChapterStartMinutes?: number;

  };

};



export type ListPlannersParams = {

  status?: string;

  sectionId?: string;

  subjectId?: string;

  teacherId?: string;

  scope?: "mine" | "section" | "school";

};



export const academicPlannerService = {

  list(params?: ListPlannersParams) {

    return apiClient<PlannerListItem[]>(

      `/academic-planners${buildQuery(params ?? {})}`,

    );

  },



  getOptions(sectionId: string, subjectId: string) {

    return apiClient<PlannerOptions>(

      `/academic-planners/options${buildQuery({ sectionId, subjectId })}`,

    );

  },



  listBookChapters(bookId: string) {

    return apiClient<PlannerBookChapter[]>(`/academic-planners/books/${bookId}/chapters`);

  },



  create(body: CreatePlannerInput) {

    return apiClient<PlannerVersionPayload>("/academic-planners", {

      method: "POST",

      body: JSON.stringify(body),

      timeoutMs: 120_000,

    });

  },

  archive(plannerId: string) {
    return apiClient<{ id: string; archived: boolean }>(`/academic-planners/${plannerId}`, {
      method: "DELETE",
    });
  },

  getVersion(plannerId: string, versionId: string) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}`,

    );

  },



  analyzeChapter(

    plannerId: string,

    versionId: string,

    chapterKey: string,

    body: { expectedRevision: number; force?: boolean },

  ) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}/chapters/${chapterKey}/analyze`,

      {

        method: "POST",

        body: JSON.stringify(body),

        timeoutMs: 120_000,

      },

    );

  },



  generateSchedule(plannerId: string, versionId: string, expectedRevision: number) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}/generate`,

      {

        method: "POST",

        body: JSON.stringify({ expectedRevision }),

        timeoutMs: 120_000,

      },

    );

  },



  listApprovals() {

    return apiClient<{

      planners: PlannerApprovalQueueItem[];

      recoveries: PlannerRecoveryQueueItem[];

    }>("/academic-planners/approvals");

  },



  getPlannerDetail(plannerId: string) {

    return apiClient<PlannerDetailResponse>(`/academic-planners/${plannerId}`);

  },



  submit(

    plannerId: string,

    versionId: string,

    body: { expectedRevision: number; acknowledgeRisk?: boolean; note?: string },

  ) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}/submit`,

      { method: "POST", body: JSON.stringify(body) },

    );

  },



  approve(

    plannerId: string,

    versionId: string,

    body: { expectedRevision: number; comment?: string },

  ) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}/approve`,

      { method: "POST", body: JSON.stringify(body) },

    );

  },



  reject(

    plannerId: string,

    versionId: string,

    body: { expectedRevision: number; comment: string },

  ) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}/reject`,

      { method: "POST", body: JSON.stringify(body) },

    );

  },



  requestChanges(

    plannerId: string,

    versionId: string,

    body: { expectedRevision: number; comment: string },

  ) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}/request-changes`,

      { method: "POST", body: JSON.stringify(body) },

    );

  },



  publishDirect(plannerId: string, versionId: string, expectedRevision: number) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}/publish-direct`,

      { method: "POST", body: JSON.stringify({ expectedRevision }) },

    );

  },



  withdraw(plannerId: string, versionId: string, expectedRevision: number) {

    return apiClient<PlannerVersionPayload>(

      `/academic-planners/${plannerId}/v/${versionId}/withdraw`,

      { method: "POST", body: JSON.stringify({ expectedRevision }) },

    );

  },



  myDay(date?: string) {

    return apiClient<MyDayPayload>(`/academic-planners/my-day${buildQuery({ date })}`);

  },



  upsertTeachingRecord(plannerId: string, body: UpsertTeachingRecordInput) {

    return apiClient<unknown>(`/academic-planners/${plannerId}/records`, {

      method: "PUT",

      body: JSON.stringify(body),

    });

  },



  teachingHelp(
    plannerId: string,
    lessonKey: string,
    body?: { versionId?: string; mode?: TeachingAssistanceMode; question?: string },
  ) {
    return apiClient<TeachingHelpPayload>(
      `/academic-planners/${plannerId}/lessons/${lessonKey}/teaching-help`,
      { method: "POST", body: JSON.stringify(body ?? {}), timeoutMs: 120_000 },
    );
  },



  listRecoveryEligible(plannerId: string) {
    return apiClient<{
      plannerId: string;
      approvedVersionId: string;
      eligible: Array<{
        lessonKey: string;
        title: string;
        scheduledDate: string;
        periodNumber: number | null;
        coverage: string;
      }>;
      changeReasons: string[];
    }>(`/academic-planners/${plannerId}/recovery-eligible`);
  },

  createRecoveryProposal(plannerId: string, body: CreateRecoveryInput) {

    return apiClient<PlannerVersionPayload>(`/academic-planners/${plannerId}/recovery-proposals`, {

      method: "POST",

      body: JSON.stringify(body),

      timeoutMs: 120_000,

    });

  },

  regenerateRecoveryProposal(
    plannerId: string,
    versionId: string,
    body: CreateRecoveryInput & { expectedRevision: number },
  ) {
    return apiClient<PlannerVersionPayload>(
      `/academic-planners/${plannerId}/v/${versionId}/recovery-regenerate`,
      {
        method: "POST",
        body: JSON.stringify(body),
        timeoutMs: 120_000,
      },
    );
  },



  plannerProgress(plannerId: string) {

    return apiClient<PlannerProgressPayload>(`/planner-reports/planners/${plannerId}/progress`);

  },

};



export type MyDayPayload = {

  date: string;

  timezone: string;

  lessons: Array<{

    sectionId: string;

    classLabel: string;

    subjectId: string;

    subjectName: string;

    periodNumber: number;

    startTime: string | null;

    endTime: string | null;

    timetableSource: string;

    planner: { id: string; title: string } | null;

    plannedLesson: {

      lessonKey: string;

      title: string;

      primaryStage: string;

      objectives: unknown;

      chapterTitle: string | null;

      plannedMinutes: number;

    } | null;

    record: { id: string; status: string; updatedAt: string } | null;

    displayStatus: string;

    attentionReasons: string[];

    canRecord: boolean;

  }>;

  pendingReports: Array<{

    plannerId: string;

    date: string;

    periodNumber: number;

    lessonKey: string;

  }>;

};



export type UpsertTeachingRecordInput = {

  date: string;

  periodNumber: number;

  status: string;

  actualLessons: Array<{ lessonKey: string; outcome: "COMPLETED" | "PARTIAL"; completedStageIndexes?: number[] }>;

  actualLibraryChapterId?: string;

  completedPortionNote?: string;

  unfinishedPortionNote?: string;

  actualMinutes?: number;

  notes?: string;

};



export type TeachingAssistanceMode =
  | "PREPARE_LESSON"
  | "EXPLAIN_TOPIC"
  | "CREATE_QUESTIONS"
  | "CLASSROOM_ACTIVITY"
  | "DIFFERENTIATE";

export type TeachingHelpOutput = {
  overview: {
    subject: string;
    classLabel: string;
    lessonTitle: string;
    teachingOverview: string;
    estimatedDurationMinutes?: number | null;
    durationIsSuggestion?: boolean;
  };
  learningObjectives: string[];
  teacherExplanation: {
    simpleExplanation: string;
    stepByStep: string[];
    terminology: Array<{ term: string; definition: string }>;
    examples: string[];
  };
  classroomDelivery: {
    warmUp: string;
    teachingSteps: string[];
    questionsDuringLesson: string[];
    activity: { title: string; materials: string; steps: string[]; minutes: number } | null;
    recap: string;
  };
  assessment: {
    formativeQuestions: Array<{
      question: string;
      expectedAnswer: string;
      kind: "recall" | "understanding" | "application";
    }>;
    exitTicket: string;
  };
  differentiation: { struggling: string[]; extension: string[] };
  sourceAndConfidence: {
    sourcesUsed: string[];
    sourceSupportedClaims: string[];
    pedagogicalSuggestions: string[];
    missingOrAmbiguous: string[];
    limitations: string;
  };
};

export type TeachingHelpPayload = {
  lessonKey: string;
  title: string;
  chapterTitle: string;
  classLabel: string;
  subjectName: string;
  mode: TeachingAssistanceMode;
  basis: "CHAPTER_TEXT" | "OBJECTIVES_ONLY" | "UNAVAILABLE";
  contentSources: {
    bookTitle: string | null;
    chapterTitle: string;
    libraryBookChapterId: string | null;
  };
  contentExcerpt: string | null;
  contextMeta?: {
    anchorsUsed: number;
    excerptCharCount: number;
    missingNotes: string[];
  };
  assistance: TeachingHelpOutput;
  aiGenerated: boolean;
  cached: boolean;
  promptVersion: string;
  provider: string | null;
  disclaimer: string;
  unavailableMessage: string | null;
};



export type CreateRecoveryInput = {
  lessonKeys: string[];

  reason: string;

  reasonNote?: string;

  includeUnreported?: boolean;

  allowBufferUse?: boolean;

  allowActivityRemoval?: boolean;

  allowCompression?: boolean;

};



export type PlannerProgressPayload = {

  plannerId: string;

  approvedVersionId: string;

  examDate: string;

  metrics: {

    plannedLessonCount: number;

    reportedCount: number;

    unreportedCount: number;

    completedCount: number;

    partialCount: number;

    notTaughtCount: number;

    differentLessonCount: number;

    plannedCompletionPct: number | null;

    actualCompletionPct: number | null;

    onTrack: boolean | null;

  };

  lessons: Array<{

    lessonKey: string;

    title: string;

    scheduledDate: string | null;

    periodNumber: number | null;

    recordStatus: string | null;

  }>;

};




export type PlannerRecoveryQueueItem = {
  plannerId: string;
  versionId: string;
  classLabel: string;
  subjectName: string;
  teacherName: string;
  submittedAt: string | null;
  summary: ScheduleSummary | null;
  impact: unknown;
  changeReason: string | null;
};

export type PlannerApprovalQueueItem = {

  plannerId: string;

  versionId: string;

  title: string;

  classLabel: string;

  subjectName: string;

  teacherName: string;

  examType: string;

  examDate: string;

  chapterCount: number;

  submittedAt: string | null;

  summary: ScheduleSummary | null;

  submittedById: string | null;

};



export type PlannerDetailResponse = {

  planner: {

    id: string;

    title: string;

    status: string;

    examDate: string;

    classLabel: string;

    subject: string;

    teacher: string;

    workingVersionId: string | null;

    approvedVersionId: string | null;

  };

  versions: Array<{

    id: string;

    versionNumber: number;

    status: string;

    origin: string;

    submittedAt: string | null;

    decidedAt: string | null;

    createdAt: string;

  }>;

  approvalEvents: Array<{

    id: string;

    action: string;

    fromStatus: string | null;

    toStatus: string | null;

    comment: string | null;

    createdAt: string;

    actorUserId: string;

    versionId: string;

  }>;

};

