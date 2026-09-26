"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { DeviceTeacherMappingPanel } from "@/components/attendance/device-teacher-mapping-panel";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { deviceService, type BiometricDevice } from "@/services/device.service";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Fingerprint } from "lucide-react";

type Tab = "mapping" | "configuration" | "devices";

const TAB_IDS: Tab[] = ["mapping", "configuration", "devices"];

function tabFromQuery(value: string | null): Tab {
  if (value && TAB_IDS.includes(value as Tab)) return value as Tab;
  return "mapping";
}

function DeviceRow({
  device,
  canManage,
  canDelete,
  onSavePoll,
  onFullSync,
  onDelete,
  pollSaving,
  deletePending,
}: {
  device: BiometricDevice;
  canManage: boolean;
  canDelete: boolean;
  onSavePoll: (sec: number) => void;
  onFullSync: () => void;
  onDelete: () => void;
  pollSaving: boolean;
  deletePending: boolean;
}) {
  const [poll, setPoll] = useState(String(device.syncIntervalSeconds));
  useEffect(() => {
    setPoll(String(device.syncIntervalSeconds));
  }, [device.syncIntervalSeconds]);

  return (
    <TableRow>
      <TableCell>{device.name}</TableCell>
      <TableCell>{device.ipAddress}:{device.port}</TableCell>
      <TableCell>
        {canManage ? (
          <Input
            className="w-24"
            type="number"
            min={60}
            value={poll}
            onChange={(e) => setPoll(e.target.value)}
          />
        ) : (
          device.syncIntervalSeconds
        )}
      </TableCell>
      <TableCell>{device.lastSyncAt ? new Date(device.lastSyncAt).toLocaleString() : "—"}</TableCell>
      {canManage ? (
        <TableCell className="space-x-2 text-right">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pollSaving || Number(poll) === device.syncIntervalSeconds}
            onClick={() => onSavePoll(Number(poll) || device.syncIntervalSeconds)}
          >
            Save
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onFullSync}>
            Full sync
          </Button>
          {canDelete ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deletePending}
              onClick={() => {
                const ok = window.confirm(
                  `Remove terminal "${device.name}" (${device.ipAddress})?\n\nDevice users, teacher mappings, and pending punches for this terminal will be removed. This cannot be undone.`,
                );
                if (ok) onDelete();
              }}
            >
              {deletePending ? "Removing…" : "Delete"}
            </Button>
          ) : null}
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function SetupTabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: "mapping", label: "Map teachers" },
    { id: "configuration", label: "Configuration" },
    { id: "devices", label: "Devices" },
  ];
  return (
    <nav className="mb-6 flex gap-2 border-b border-border pb-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onTab(item.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            tab === item.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export default function SetupAttendancePage() {
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canView = can("VIEW_BIOMETRIC_DEVICES") || can("MANAGE_TEACHERS");
  const canManage = can("MANAGE_BIOMETRIC_DEVICES") || can("MANAGE_TEACHERS");
  const canDeleteDevice = can("MANAGE_BIOMETRIC_DEVICES");
  const [tab, setTab] = useState<Tab>(() => tabFromQuery(searchParams.get("tab")));

  useEffect(() => {
    setTab(tabFromQuery(searchParams.get("tab")));
  }, [searchParams]);
  const [showKey, setShowKey] = useState(false);

  const setup = useQuery({
    queryKey: ["attendance-setup"],
    queryFn: () => deviceService.getAttendanceSetup(),
    enabled: canView,
  });

  const [autoCheckoutHours, setAutoCheckoutHours] = useState("24");
  const [punchTimeMode, setPunchTimeMode] = useState<"school_local" | "utc">("school_local");
  const [preferUdp, setPreferUdp] = useState(false);
  const [connectionTimeoutSec, setConnectionTimeoutSec] = useState("30");
  const [userSyncIntervalSec, setUserSyncIntervalSec] = useState("600");
  const [batchSize, setBatchSize] = useState("25");

  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("4370");
  const [syncIntervalSec, setSyncIntervalSec] = useState("300");

  useEffect(() => {
    const data = setup.data;
    if (!data) return;
    setAutoCheckoutHours(String(data.autoCheckoutHours ?? 24));
    setPunchTimeMode(data.edgeSync.punchTimeMode);
    setPreferUdp(data.edgeSync.preferUdp);
    setConnectionTimeoutSec(String(data.edgeSync.connectionTimeoutSec));
    setUserSyncIntervalSec(String(data.edgeSync.userSyncIntervalSec));
    setBatchSize(String(data.edgeSync.batchSize));
  }, [setup.data]);

  const saveConfig = useMutation({
    mutationFn: () =>
      deviceService.updateAttendanceSetup({
        autoCheckoutHours: Number(autoCheckoutHours),
        edgeSync: {
          punchTimeMode,
          preferUdp,
          connectionTimeoutSec: Number(connectionTimeoutSec),
          userSyncIntervalSec: Number(userSyncIntervalSec),
          batchSize: Number(batchSize),
        },
      }),
    onSuccess: () => {
      toast({ title: "Attendance sync settings saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance-setup"] });
    },
    onError: (err) =>
      toast({
        title: "Save failed",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  const regenerate = useMutation({
    mutationFn: () => deviceService.regenerateSyncKey(),
    onSuccess: () => {
      toast({ title: "API key regenerated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance-setup"] });
    },
  });

  const createDevice = useMutation({
    mutationFn: () =>
      deviceService.create({
        name,
        ipAddress: ip,
        port: Number(port) || 4370,
        syncIntervalSeconds: Number(syncIntervalSec) || 300,
      }),
    onSuccess: () => {
      toast({ title: "Device added", variant: "success" });
      setName("");
      setIp("");
      queryClient.invalidateQueries({ queryKey: ["attendance-setup"] });
    },
    onError: (err) =>
      toast({
        title: "Could not add device",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  const requestFullSync = useMutation({
    mutationFn: (deviceId: string) => deviceService.requestFullSync(deviceId),
    onSuccess: () => {
      toast({
        title: "Full sync queued",
        description:
          "On the laptop: stop and run run-edge-sync.bat to re-upload all attendance punches. Users from the terminal sync automatically every cycle while the agent runs.",
        variant: "success",
      });
    },
  });

  const updateDevicePoll = useMutation({
    mutationFn: ({ id, syncIntervalSeconds }: { id: string; syncIntervalSeconds: number }) =>
      deviceService.update(id, { syncIntervalSeconds }),
    onSuccess: () => {
      toast({ title: "Poll interval saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance-setup"] });
    },
  });

  const deleteDevice = useMutation({
    mutationFn: (id: string) => deviceService.remove(id),
    onSuccess: () => {
      toast({ title: "Terminal removed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance-setup"] });
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
    },
    onError: (err) =>
      toast({
        title: "Could not remove terminal",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  const copyApiKey = async () => {
    const key = setup.data?.apiKey;
    if (!key) return;
    await navigator.clipboard.writeText(key);
    toast({ title: "API key copied — paste it when the laptop agent asks", variant: "success" });
  };

  if (!canView) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">You do not have access to attendance setup.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Attendance setup"
        description="Configure terminals and sync behaviour here. On the laptop, run the agent once and paste the sync API key."
      />
      <p className="mb-4 text-sm text-muted-foreground">
        <Link href="/school/setup" className="text-primary underline">Setup</Link>
      </p>

      <SetupTabs tab={tab} onTab={setTab} />

      {tab === "mapping" ? (
        <DeviceTeacherMappingPanel setupHref="/school/setup/attendance?tab=devices" />
      ) : setup.isLoading ? (
        <PageLoader variant="panel" />
      ) : tab === "configuration" ? (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Laptop agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <ol className="list-decimal space-y-2 pl-4">
                <li>Add each terminal on the <strong className="text-foreground">Devices</strong> tab.</li>
                <li>On the school PC: run <code className="text-foreground">setup-edge-sync.bat</code>, then{" "}
                  <code className="text-foreground">run-edge-sync.bat</code>.</li>
                <li>When asked, paste the <strong className="text-foreground">sync API key</strong> below (copied once per school).</li>
                <li>If you have more than one terminal, pick which one this laptop serves.</li>
                <li>After you change settings here, stop and run the agent again to reload from the cloud.</li>
              </ol>
              <div>
                <Label>School sync API key</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[200px] flex-1 font-mono text-xs"
                    readOnly
                    value={showKey ? setup.data?.apiKey ?? "" : "••••••••••••••••••••"}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowKey((v) => !v)}>
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button type="button" variant="outline" onClick={copyApiKey}>
                    Copy key
                  </Button>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={regenerate.isPending}
                      onClick={() => {
                        if (window.confirm("Regenerate key? Laptops must paste the new key on next run.")) {
                          regenerate.mutate();
                        }
                      }}
                    >
                      Regenerate
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs">
                Timezone: {setup.data?.timezone}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sync timing (applied by laptop agent via API)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Auto check-out after (hours)</Label>
                <Input value={autoCheckoutHours} onChange={(e) => setAutoCheckoutHours(e.target.value)} />
              </div>
              <div>
                <Label>Punch time mode</Label>
                <Select value={punchTimeMode} onChange={(e) => setPunchTimeMode(e.target.value as "school_local" | "utc")}>
                  <option value="school_local">School local wall clock</option>
                  <option value="utc">UTC</option>
                </Select>
              </div>
              <div>
                <Label>User list sync interval (sec)</Label>
                <Input value={userSyncIntervalSec} onChange={(e) => setUserSyncIntervalSec(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  <strong>Attendance punch sync interval</strong> is set per terminal on the Devices tab
                  (how long the agent waits between each read from the machine).
                </p>
              </div>
              <div>
                <Label>Connection timeout (sec)</Label>
                <Input value={connectionTimeoutSec} onChange={(e) => setConnectionTimeoutSec(e.target.value)} />
              </div>
              <div>
                <Label>Upload batch size</Label>
                <Input value={batchSize} onChange={(e) => setBatchSize(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferUdp}
                    onChange={(e) => setPreferUdp(e.target.checked)}
                  />
                  Prefer UDP to device (use only if TCP is unstable)
                </Label>
              </div>
              {canManage ? (
                <div className="sm:col-span-2">
                  <Button disabled={saveConfig.isPending} onClick={() => saveConfig.mutate()}>
                    {saveConfig.isPending ? "Saving…" : "Save configuration"}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Fingerprint className="h-4 w-4" />
                  Add terminal
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-5">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Staff door" />
                </div>
                <div>
                  <Label>IP</Label>
                  <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.201" />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input value={port} onChange={(e) => setPort(e.target.value)} />
                </div>
                <div>
                  <Label>Attendance sync every (sec)</Label>
                  <Input value={syncIntervalSec} onChange={(e) => setSyncIntervalSec(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={!name.trim() || !ip.trim() || createDevice.isPending}
                    onClick={() => createDevice.mutate()}
                  >
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Sync every (sec)</TableHead>
                    <TableHead>Last sync</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(setup.data?.devices ?? []).map((d) => (
                    <DeviceRow
                      key={d.id}
                      device={d}
                      canManage={canManage}
                      onSavePoll={(sec) => updateDevicePoll.mutate({ id: d.id, syncIntervalSeconds: sec })}
                      onFullSync={() => requestFullSync.mutate(d.id)}
                      canDelete={canDeleteDevice}
                      onDelete={() => deleteDevice.mutate(d.id)}
                      pollSaving={updateDevicePoll.isPending}
                      deletePending={deleteDevice.isPending && deleteDevice.variables === d.id}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
