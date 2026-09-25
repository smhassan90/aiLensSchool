"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherAttendanceTabs } from "../attendance-tabs";
import { deviceService } from "@/services/device.service";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function TeacherAttendanceDevicesPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canView = can("VIEW_BIOMETRIC_DEVICES") || can("MANAGE_TEACHERS");
  const canManage = can("MANAGE_BIOMETRIC_DEVICES") || can("MANAGE_TEACHERS");

  const devices = useQuery({
    queryKey: ["biometric-devices"],
    queryFn: () => deviceService.list(),
    enabled: canView,
  });

  const [mapDeviceId, setMapDeviceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const candidates = useQuery({
    queryKey: ["device-mapping-candidates", mapDeviceId],
    queryFn: () => deviceService.mappingCandidates(mapDeviceId!),
    enabled: Boolean(mapDeviceId) && canManage,
  });

  const syncUsers = useMutation({
    mutationFn: (id: string) => deviceService.syncUsers(id),
    onSuccess: () => {
      toast({ title: "Users synced from device", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
    },
    onError: (err) =>
      toast({
        title: "Sync users failed",
        description: err instanceof ApiClientError ? err.message : "Cloud API cannot reach the LAN device. Use the Python edge agent.",
        variant: "error",
      }),
  });

  const syncAttendance = useMutation({
    mutationFn: (id: string) => deviceService.syncAttendance(id),
    onSuccess: () => {
      toast({ title: "Attendance synced", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance-history"] });
    },
    onError: (err) =>
      toast({
        title: "Sync attendance failed",
        description: err instanceof ApiClientError ? err.message : "Use the edge sync agent when the API is cloud-hosted.",
        variant: "error",
      }),
  });

  const confirmMappings = useMutation({
    mutationFn: () => {
      const mappings = Object.entries(draft)
        .filter(([, teacherId]) => teacherId)
        .map(([deviceUserId, teacherId]) => ({ deviceUserId, teacherId }));
      return deviceService.confirmMappings(mapDeviceId!, mappings);
    },
    onSuccess: (res) => {
      toast({
        title: `Mapped ${res.mappings} user(s) · ${res.pendingPunchesApplied} pending punches applied`,
        variant: "success",
      });
      setMapDeviceId(null);
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["device-mapping-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance-history"] });
    },
    onError: (err) =>
      toast({
        title: "Mapping failed",
        description: err instanceof ApiClientError ? err.message : "",
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

  const openMap = (deviceId: string) => {
    setMapDeviceId(deviceId);
    setDraft({});
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teacher attendance"
        description="Pull users and punches when the API runs on the school LAN. Otherwise use the edge sync agent from Setup."
      />
      <TeacherAttendanceTabs />
      {!canView ? (
        <p className="text-sm text-muted-foreground">You do not have access to biometric devices.</p>
      ) : devices.isLoading ? (
        <PageLoader variant="panel" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure devices and API keys in{" "}
            <Link href="/school/setup/attendance" className="text-primary underline">
              Setup → Attendance
            </Link>
            .
          </p>
          {(devices.data ?? []).map((device) => (
            <Card key={device.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
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
                      onClick={() => syncUsers.mutate(device.id)}
                    >
                      Sync users
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={syncAttendance.isPending}
                      onClick={() => syncAttendance.mutate(device.id)}
                    >
                      Sync attendance
                    </Button>
                    <Button size="sm" onClick={() => openMap(device.id)}>Map teachers</Button>
                  </div>
                ) : null}
              </CardHeader>
            </Card>
          ))}
          {!devices.data?.length ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No biometric devices yet. Add one in Setup.
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      <Dialog open={Boolean(mapDeviceId)} onOpenChange={(open) => !open && setMapDeviceId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Map device users to teachers</DialogTitle>
          </DialogHeader>
          {candidates.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading mappings…</p>
          ) : (
            <div className="space-y-4">
              {(candidates.data?.unmappedDeviceUsers ?? []).map((user) => {
                const value = draft[user.deviceUserId] ?? suggestionMap[user.deviceUserId] ?? "";
                return (
                  <div key={user.deviceUserId} className="grid gap-2 border-b border-border pb-3">
                    <div className="text-sm font-medium">
                      {user.deviceUserName || "Unnamed"} (ID {user.deviceUserId})
                      {user.pendingCount ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {user.pendingCount} pending punch(es)
                        </span>
                      ) : null}
                    </div>
                    <Label className="text-xs text-muted-foreground">Teacher</Label>
                    <Select
                      value={value}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [user.deviceUserId]: e.target.value }))
                      }
                    >
                      <option value="">Select teacher</option>
                      {(candidates.data?.unmappedTeachers ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} · {t.employeeCode}
                        </option>
                      ))}
                    </Select>
                  </div>
                );
              })}
              {!candidates.data?.unmappedDeviceUsers?.length ? (
                <p className="text-sm text-muted-foreground">All device users on this terminal are mapped.</p>
              ) : null}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMapDeviceId(null)}>Cancel</Button>
            <Button
              disabled={confirmMappings.isPending}
              onClick={() => confirmMappings.mutate()}
            >
              {confirmMappings.isPending ? "Saving…" : "Confirm mappings"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
