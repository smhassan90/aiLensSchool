import { apiClient, apiForm, buildQuery } from "@/lib/api-client";

export type TimetableWeekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type TimetablePeriodKind = "LESSON" | "BREAK" | "OTHER";

export type TimetableValidationIssue = {
  code: string;
  severity: "BLOCKING" | "WARNING";
  weekday?: TimetableWeekday;
  periodNumber?: number | null;
  message: string;
  relatedVersionId?: string;
};

export type TimetablePeriodRow = {
  id: string;
  weekday: TimetableWeekday;
  periodNumber: number | null;
  kind: TimetablePeriodKind;
  startTime: string | null;
  endTime: string | null;
  label: string;
  subjectId: string | null;
  teacherId: string | null;
  room: string | null;
  rawSubjectText?: string | null;
  rawTeacherText?: string | null;
  sortOrder: number;
};

export type TimetableVersionSummary = {
  id: string;
  sectionId: string;
  versionNumber: number;
  status: string;
  sourceType: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  revision: number;
  createdAt: string;
  publishedAt: string | null;
  section?: { name: string; grade: { name: string } };
};

export type TimetableVersionDetail = {
  version: TimetableVersionSummary & {
    academicYearId: string;
    notes: string | null;
    section: { id: string; name: string; grade: { name: string } };
    periods: TimetablePeriodRow[];
  };
  validation: TimetableValidationIssue[];
};

export type TimetableImportListItem = {
  id: string;
  status: string;
  sourceType: string;
  originalFilename: string;
  warnings: unknown;
  createdAt: string;
  academicYearId: string;
};

export type TimetableImportDetail = {
  import: {
    id: string;
    status: string;
    sourceType: string;
    originalFilename: string;
    warnings: unknown;
    createdAt: string;
  };
  versions: Array<{
    id: string;
    sectionId: string | null;
    classLabel: string | null;
    section: { id: string; name: string; grade: { name: string } } | null;
    periods: TimetablePeriodRow[];
    validation: unknown;
    revision: number;
    status: string;
  }>;
  unresolvedClasses: unknown[];
};

export type PeriodInput = {
  weekday: TimetableWeekday;
  periodNumber?: number | null;
  kind: TimetablePeriodKind;
  startTime?: string | null;
  endTime?: string | null;
  label: string;
  subjectId?: string | null;
  teacherId?: string | null;
  room?: string | null;
};

export type TimetableResolvePeriod = {
  periodNumber: number;
  startTime: string | null;
  endTime: string | null;
  minutes: number;
  kind?: string;
  subjectId?: string | null;
};

export type TimetableResolveResult = {
  source: string;
  versionId: string | null;
  working: boolean;
  reason: string | null;
  periods: TimetableResolvePeriod[];
};

export const timetablesService = {
  resolve(sectionId: string, date: string) {
    return apiClient<TimetableResolveResult>(
      `/timetables/resolve${buildQuery({ sectionId, date })}`,
    );
  },

  listImports(params?: { page?: number; limit?: number }) {
    return apiClient<{ items: TimetableImportListItem[]; total: number; page: number; limit: number }>(
      `/timetables/imports${buildQuery(params ?? {})}`,
    );
  },

  getImport(importId: string) {
    return apiClient<TimetableImportDetail>(`/timetables/imports/${importId}`);
  },

  uploadImport(file: File, academicYearId?: string) {
    const body = new FormData();
    body.append("file", file);
    if (academicYearId) body.append("academicYearId", academicYearId);
    return apiForm<TimetableImportDetail>("/timetables/imports", body);
  },

  reExtractImport(importId: string) {
    return apiClient<TimetableImportDetail>(`/timetables/imports/${importId}/extract`, {
      method: "POST",
    });
  },

  discardImport(importId: string) {
    return apiClient<{ ok: boolean }>(`/timetables/imports/${importId}/discard`, {
      method: "POST",
    });
  },

  listVersions(params?: { sectionId?: string; status?: string }) {
    return apiClient<TimetableVersionSummary[]>(
      `/timetables/versions${buildQuery(params ?? {})}`,
    );
  },

  getVersion(versionId: string) {
    return apiClient<TimetableVersionDetail>(`/timetables/versions/${versionId}`);
  },

  createManualVersion(body: {
    sectionId: string;
    academicYearId?: string;
    cloneFromVersionId?: string;
  }) {
    return apiClient<TimetableVersionDetail>("/timetables/versions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  updateVersion(
    versionId: string,
    body: { expectedRevision: number; sectionId?: string; periods: PeriodInput[] },
  ) {
    return apiClient<TimetableVersionDetail>(`/timetables/versions/${versionId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  validateVersion(versionId: string) {
    return apiClient<{ issues: TimetableValidationIssue[] }>(
      `/timetables/versions/${versionId}/validate`,
      { method: "POST" },
    );
  },

  publish(body: {
    items: Array<{ versionId: string; expectedRevision: number }>;
    effectiveFrom: string;
  }) {
    return apiClient<{ published: Array<{ id: string; sectionId: string; versionNumber: number }> }>(
      "/timetables/publish",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
};
