import { apiClient, buildQuery } from "@/lib/api-client";

export type BiometricDevice = {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  serialNumber?: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  syncIntervalSeconds: number;
};

export type EdgeSyncSettings = {
  punchTimeMode: "school_local" | "utc";
  preferUdp: boolean;
  connectionTimeoutSec: number;
  userSyncIntervalSec: number;
  batchSize: number;
  configRefreshIntervalSec: number;
};

export type AttendanceSetup = {
  schoolName: string;
  apiKey: string;
  backendUrl: string;
  timezone: string;
  autoCheckoutHours: number;
  edgeSync: EdgeSyncSettings;
  devices: BiometricDevice[];
};

export type TabletSyncSetup = {
  apiKey: string;
  timezone: string;
  devices: BiometricDevice[];
};

export type MappingCandidates = {
  unmappedDeviceUsers: Array<{
    deviceUserId: string;
    deviceUserName: string | null;
    deviceBadgeId: string | null;
    pendingCount: number;
  }>;
  unmappedTeachers: Array<{ id: string; name: string; employeeCode: string }>;
  suggestions: Array<{
    deviceUserId: string;
    teacherId: string;
    teacherName: string;
    deviceUserName: string | null;
  }>;
  pendingCounts: Record<string, number>;
};

export const deviceService = {
  getAttendanceSetup: () => apiClient<AttendanceSetup>("/device/attendance-setup"),
  updateAttendanceSetup: (body: {
    autoCheckoutHours?: number;
    edgeSync?: Partial<EdgeSyncSettings>;
  }) =>
    apiClient<AttendanceSetup>("/device/attendance-setup", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getTabletSyncSetup: () => apiClient<TabletSyncSetup>("/device/tablet-sync-setup"),
  regenerateSyncKey: () =>
    apiClient<{ apiKey: string }>("/device/tablet-sync/regenerate-key", { method: "POST" }),
  list: () => apiClient<BiometricDevice[]>("/device"),
  create: (body: {
    name: string;
    ipAddress: string;
    port?: number;
    syncIntervalSeconds?: number;
  }) =>
    apiClient<BiometricDevice>("/device", { method: "POST", body: JSON.stringify(body) }),
  update: (
    id: string,
    body: Partial<{
      name: string;
      ipAddress: string;
      port: number;
      isActive: boolean;
      syncIntervalSeconds: number;
    }>,
  ) =>
    apiClient<BiometricDevice>(`/device/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => apiClient(`/device/${id}`, { method: "DELETE" }),
  test: (id: string) => apiClient<{ ok: boolean; serialNumber?: string }>(`/device/${id}/test`, { method: "POST" }),
  syncUsers: (id: string) => apiClient(`/device/${id}/sync-users`, { method: "POST" }),
  syncAttendance: (id: string, startDate?: string, endDate?: string) =>
    apiClient(`/device/${id}/sync-attendance${buildQuery({ startDate, endDate })}`, { method: "POST" }),
  mappingCandidates: (id: string) => apiClient<MappingCandidates>(`/device/${id}/mapping-candidates`),
  requestFullSync: (id: string) =>
    apiClient(`/device/${id}/request-full-sync`, { method: "POST" }),
  confirmMappings: (id: string, mappings: Array<{ deviceUserId: string; teacherId: string }>) =>
    apiClient<{ mappings: number; pendingPunchesApplied: number }>(`/device/${id}/mappings/confirm`, {
      method: "POST",
      body: JSON.stringify({ mappings }),
    }),
};
