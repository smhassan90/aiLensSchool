"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deviceService, type BiometricDevice } from "@/services/device.service";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/layout/page-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  setupHref?: string;
  showSetupHint?: boolean;
};

type MappingRow = { deviceUserId: string; teacherId: string };

function buildMappingsToSave(
  unmapped: Array<{ deviceUserId: string }>,
  draft: Record<string, string>,
  suggestionMap: Record<string, string>,
): MappingRow[] {
  return unmapped
    .map((user) => {
      const teacherId = draft[user.deviceUserId] ?? suggestionMap[user.deviceUserId] ?? "";
      return teacherId ? { deviceUserId: user.deviceUserId, teacherId } : null;
    })
    .filter((row): row is MappingRow => row !== null);
}

function teachersForDeviceUser(
  deviceUserId: string,
  unmappedTeachers: Array<{ id: string; name: string; employeeCode: string }>,
  suggestions: Array<{ deviceUserId: string; teacherId: string; teacherName: string }>,
  suggestionMap: Record<string, string>,
) {
  const byId = new Map(unmappedTeachers.map((t) => [t.id, t]));
  const suggestedId = suggestionMap[deviceUserId];
  if (suggestedId && !byId.has(suggestedId)) {
    const sug = suggestions.find((s) => s.deviceUserId === deviceUserId);
    if (sug) {
      byId.set(sug.teacherId, {
        id: sug.teacherId,
        name: sug.teacherName,
        employeeCode: "",
      });
    }
  }
  return [...byId.values()];
}

function DeviceMappingCard({
  device,
  canManage,
  canClearSyncedUsers,
}: {
  device: BiometricDevice;
  canManage: boolean;
  canClearSyncedUsers: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const candidates = useQuery({
    queryKey: ["device-mapping-candidates", device.id],
    queryFn: () => deviceService.mappingCandidates(device.id),
    enabled: canManage,
  });

  const syncUsers = useMutation({
    mutationFn: () => deviceService.syncUsers(device.id),
    onSuccess: () => {
      toast({ title: "Users synced from device", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      queryClient.invalidateQueries({ queryKey: ["device-mapping-candidates", device.id] });
    },
    onError: (err) =>
      toast({
        title: "Sync users failed",
        description:
          err instanceof ApiClientError
            ? err.message
            : "Cloud API cannot reach the LAN device. Use the Python edge agent.",
        variant: "error",
      }),
  });

  const clearSyncedUsers = useMutation({
    mutationFn: () => deviceService.clearSyncedUsers(device.id),
    onSuccess: (res) => {
      toast({
        title: "Synced users cleared",
        description: `Removed ${res.deletedUsers} user(s), ${res.deletedMappings} mapping(s), ${res.deletedPendingPunches} pending punch(es). Keep run-edge-sync.bat running — it refreshes the user list from the terminal every cycle.`,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      queryClient.invalidateQueries({ queryKey: ["device-mapping-candidates", device.id] });
      setDraft({});
    },
    onError: (err) =>
      toast({
        title: "Could not clear synced users",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  const syncAttendance = useMutation({
    mutationFn: () => deviceService.syncAttendance(device.id),
    onSuccess: () => {
      toast({ title: "Attendance synced", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance-history"] });
    },
    onError: (err) =>
      toast({
        title: "Sync attendance failed",
        description:
          err instanceof ApiClientError
            ? err.message
            : "Use the edge sync agent when the API is cloud-hosted.",
        variant: "error",
      }),
  });

  const suggestionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of candidates.data?.suggestions ?? []) {
      map[row.deviceUserId] = row.teacherId;
    }
    return map;
  }, [candidates.data?.suggestions]);

  const unmapped = candidates.data?.unmappedDeviceUsers ?? [];
  const mappedPairs = candidates.data?.mappedPairs ?? [];
  const suggestions = candidates.data?.suggestions ?? [];

  const mappingsReadyCount = buildMappingsToSave(unmapped, draft, suggestionMap).length;

  useEffect(() => {
    if (!suggestions.length) return;
    setDraft((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const row of suggestions) {
        if (!next[row.deviceUserId]) {
          next[row.deviceUserId] = row.teacherId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [suggestions]);

  const unmapTeacher = useMutation({
    mutationFn: (mappingId: string) => deviceService.deleteMapping(mappingId),
    onSuccess: () => {
      toast({
        title: "Mapping removed",
        description: "Pick the correct teacher below and save mappings.",
        variant: "success",
      });
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["device-mapping-candidates", device.id] });
    },
    onError: (err) =>
      toast({
        title: "Could not remove mapping",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  const confirmMappings = useMutation({
    mutationFn: (mappings: MappingRow[]) => deviceService.confirmMappings(device.id, mappings),
    onSuccess: (res) => {
      toast({
        title: `Mapped ${res.mappings} user(s) · ${res.pendingPunchesApplied} pending punches applied`,
        variant: "success",
      });
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["device-mapping-candidates", device.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance-history"] });
    },
    onError: (err) =>
      toast({
        title: "Mapping failed",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="h-4 w-4" />
            {device.name}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {device.ipAddress}:{device.port}
            {device.lastSyncAt
              ? ` · Last sync ${new Date(device.lastSyncAt).toLocaleString()}`
              : " · Never synced"}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={syncUsers.isPending}
              onClick={() => syncUsers.mutate()}
            >
              Sync users
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={syncAttendance.isPending}
              onClick={() => syncAttendance.mutate()}
            >
              Sync attendance
            </Button>
            {canClearSyncedUsers ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={clearSyncedUsers.isPending}
                onClick={() => {
                  const ok = window.confirm(
                    `Clear all users synced from "${device.name}" in HawkNexa?\n\nThis removes device users, teacher mappings, and pending punches for this terminal in the cloud. It does not delete users on the physical terminal or past teacher attendance records.\n\nThen run run-edge-sync.bat (user sync) or Sync users to import the current list.`,
                  );
                  if (ok) clearSyncedUsers.mutate();
                }}
              >
                {clearSyncedUsers.isPending ? "Clearing…" : "Clear synced users"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>

      {canManage ? (
        <CardContent className="space-y-4 border-t pt-4">
          <div>
            <h3 className="text-sm font-medium">Map device users to teachers</h3>
            <p className="text-xs text-muted-foreground">
              Match each terminal user to a teacher. Pending punches apply when you save mappings.
            </p>
          </div>

          {candidates.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading device users…</p>
          ) : candidates.isError ? (
            <p className="text-sm text-destructive">Could not load mapping data.</p>
          ) : (
            <>
              {mappedPairs.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Already mapped
                  </h4>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Device user</TableHead>
                          <TableHead>Teacher</TableHead>
                          {canManage ? <TableHead className="w-[100px] text-right">Action</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappedPairs.map((row) => (
                          <TableRow key={row.mappingId}>
                            <TableCell>
                              <div className="font-medium">
                                {row.deviceUserName || `ID ${row.deviceUserId}`}
                              </div>
                              <div className="text-xs text-muted-foreground">ID {row.deviceUserId}</div>
                            </TableCell>
                            <TableCell>
                              {row.teacherName}
                              {row.employeeCode ? (
                                <span className="text-muted-foreground"> · {row.employeeCode}</span>
                              ) : null}
                            </TableCell>
                            {canManage ? (
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={unmapTeacher.isPending}
                                  onClick={() => {
                                    const ok = window.confirm(
                                      `Remove mapping for "${row.deviceUserName || row.deviceUserId}" → ${row.teacherName}?\n\nThe device user will appear in the list below so you can map them to another teacher.`,
                                    );
                                    if (ok) unmapTeacher.mutate(row.mappingId);
                                  }}
                                >
                                  {unmapTeacher.isPending && unmapTeacher.variables === row.mappingId
                                    ? "Removing…"
                                    : "Unmap"}
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}

              {unmapped.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {mappedPairs.length > 0
                    ? "No unmapped device users on this terminal."
                    : "No device users yet. Run the edge sync agent or Sync users after enrolling teachers on the terminal."}
                </p>
              ) : (
                <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device user</TableHead>
                      <TableHead className="w-[100px]">Pending</TableHead>
                      <TableHead className="min-w-[220px]">Teacher</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmapped.map((user) => {
                      const value = draft[user.deviceUserId] ?? suggestionMap[user.deviceUserId] ?? "";
                      const teacherOptions = teachersForDeviceUser(
                        user.deviceUserId,
                        candidates.data?.unmappedTeachers ?? [],
                        suggestions,
                        suggestionMap,
                      );
                      const isSuggested = Boolean(suggestionMap[user.deviceUserId]);
                      return (
                        <TableRow key={user.deviceUserId}>
                          <TableCell>
                            <div className="font-medium">
                              {user.deviceUserName || "Unnamed"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ID {user.deviceUserId}
                              {isSuggested ? (
                                <span className="ml-2 text-primary">Name match</span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {user.pendingCount ? user.pendingCount : "—"}
                          </TableCell>
                          <TableCell>
                            <Label className="sr-only" htmlFor={`teacher-${device.id}-${user.deviceUserId}`}>
                              Teacher for {user.deviceUserName || user.deviceUserId}
                            </Label>
                            <Select
                              id={`teacher-${device.id}-${user.deviceUserId}`}
                              value={value}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [user.deviceUserId]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Select teacher</option>
                              {teacherOptions.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.employeeCode ? `${t.name} · ${t.employeeCode}` : t.name}
                                </option>
                              ))}
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={confirmMappings.isPending || mappingsReadyCount === 0}
                  onClick={() =>
                    confirmMappings.mutate(buildMappingsToSave(unmapped, draft, suggestionMap))
                  }
                >
                  {confirmMappings.isPending ? "Saving…" : "Save mappings"}
                </Button>
              </div>
                </>
              )}
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function DeviceTeacherMappingPanel({ setupHref, showSetupHint = false }: Props) {
  const { can } = useAuth();
  const canView = can("VIEW_BIOMETRIC_DEVICES") || can("MANAGE_TEACHERS");
  const canManage = can("MANAGE_BIOMETRIC_DEVICES") || can("MANAGE_TEACHERS");
  const canClearSyncedUsers = can("MANAGE_BIOMETRIC_DEVICES");

  const devices = useQuery({
    queryKey: ["biometric-devices"],
    queryFn: () => deviceService.list(),
    enabled: canView,
  });

  if (!canView) {
    return <p className="text-sm text-muted-foreground">You do not have access to device mapping.</p>;
  }

  if (devices.isLoading) {
    return <PageLoader variant="panel" />;
  }

  return (
    <div className="space-y-4">
      {showSetupHint && setupHref ? (
        <p className="text-sm text-muted-foreground">
          Terminals and API keys:{" "}
          <Link href={setupHref} className="text-primary underline">Configuration &amp; devices</Link>
          .
        </p>
      ) : null}
      {(devices.data ?? []).map((device) => (
        <DeviceMappingCard
          key={device.id}
          device={device}
          canManage={canManage}
          canClearSyncedUsers={canClearSyncedUsers}
        />
      ))}
      {!devices.data?.length ? (
        <Card className="w-full">
          <CardContent className="flex min-h-[120px] items-center justify-center py-8">
            <p className="text-center text-sm text-muted-foreground">
              No biometric devices yet. Add one under{" "}
              {setupHref ? (
                <Link href={setupHref} className="text-primary underline">Devices</Link>
              ) : (
                "Setup → Attendance"
              )}
              .
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
