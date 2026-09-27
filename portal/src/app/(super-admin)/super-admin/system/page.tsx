"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { platformService } from "@/services/platform.service";
import { schoolsService } from "@/services/schools.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

export default function SystemPage() {
  const { toast } = useToast();
  const [schoolId, setSchoolId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const schools = useQuery({
    queryKey: ["schools-system"],
    queryFn: () => schoolsService.list({ limit: 100 }),
  });

  const purge = useMutation({
    mutationFn: () =>
      platformService.purgeData({
        schoolId: schoolId || undefined,
        from,
        to,
        confirm: true,
      }),
    onSuccess: (result) => {
      toast({
        title: "Data cleared",
        description: `${result.auditDeleted} audit rows, ${result.aiDeleted} AI requests, ${result.lessonsDeleted} lessons removed.`,
        variant: "success",
      });
    },
    onError: (err) =>
      toast({
        title: "Purge failed",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="System" description="Data retention and platform maintenance" />

      <Card className="max-w-xl border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Clear data by date range</CardTitle>
          <CardDescription>
            Deletes audit logs, AI usage records, and lessons (including stored page photos) created
            between the selected dates. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="purge-school">School (optional)</Label>
            <Select id="purge-school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">All schools</option>
              {(schools.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="purge-from">From</Label>
              <Input id="purge-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="purge-to">To</Label>
              <Input id="purge-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <Button
            variant="destructive"
            disabled={!from || !to || purge.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  "Permanently delete audit logs, AI records, and lessons in this date range?",
                )
              ) {
                return;
              }
              purge.mutate();
            }}
          >
            {purge.isPending ? "Clearing…" : "Clear data"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
