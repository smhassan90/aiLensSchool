"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/providers/auth-provider";
import { timetablesService } from "@/services/timetables.service";
import { TimetableUploadCard } from "@/components/timetable/timetable-upload-card";
import { formatStatusLabel } from "@/lib/display-labels";
import { formatDate } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

export default function TimetableManagePage() {
  const { can } = useAuth();
  const canManage = can("MANAGE_CLASSES");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [manualSectionId, setManualSectionId] = useState("");

  const versions = useQuery({
    queryKey: ["timetable-versions"],
    queryFn: () => timetablesService.listVersions(),
  });
  const imports = useQuery({
    queryKey: ["timetable-imports", { page: 1 }],
    queryFn: () => timetablesService.listImports({ page: 1, limit: 10 }),
  });
  const sections = useQuery({
    queryKey: ["sections", "timetable-manage"],
    queryFn: () => academicsService.listSections({ limit: 200 }),
    enabled: canManage,
  });
  const createManual = useMutation({
    mutationFn: () => timetablesService.createManualVersion({ sectionId: manualSectionId }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["timetable-versions"] });
      router.push(`/school/timetable/versions/${data.version.id}`);
    },
    onError: (err) => {
      toast({ title: "Could not create draft", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const published = (versions.data ?? []).filter((v) => v.status === "PUBLISHED");
  const drafts = (versions.data ?? []).filter((v) => v.status === "DRAFT");

  if (!canManage) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Timetable management" description="You do not have permission to manage timetables." />
        <Link href="/school/timetable">
          <Button type="button" variant="outline">View class timetables</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Timetable management"
        description="Upload imports, edit drafts, validate conflicts, and publish schedules."
        actions={
          <Link href="/school/timetable">
            <Button type="button" variant="outline" size="sm">Class view</Button>
          </Link>
        }
      />

      <TimetableUploadCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual draft</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Select
              value={manualSectionId}
              onChange={(e) => setManualSectionId(e.target.value)}
            >
              <option value="">Select section</option>
              {(sections.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.grade?.name} {s.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!manualSectionId || createManual.isPending}
            onClick={() => createManual.mutate()}
          >
            {createManual.isPending ? "Creating…" : "Create empty draft"}
          </Button>
        </CardContent>
      </Card>

      {(versions.isLoading || imports.isLoading) && <PageLoader />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Published versions</CardTitle>
            <Link href="/school/timetable/imports">
              <Button type="button" variant="ghost" size="sm">All imports</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {published.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published versioned timetables yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead>v#</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {published.slice(0, 8).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        {v.section
                          ? `${v.section.grade.name} ${v.section.name}`
                          : v.sectionId.slice(0, 8)}
                      </TableCell>
                      <TableCell>{v.effectiveFrom ? formatDate(v.effectiveFrom) : "—"}</TableCell>
                      <TableCell>
                        <Link href={`/school/timetable/versions/${v.id}`} className="text-primary underline">
                          {v.versionNumber}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Draft versions</CardTitle>
          </CardHeader>
          <CardContent>
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts awaiting review.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        {v.section
                          ? `${v.section.grade.name} ${v.section.name}`
                          : v.sectionId.slice(0, 8)}
                      </TableCell>
                      <TableCell>{formatStatusLabel(v.status)}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/school/timetable/versions/${v.id}`}>
                          <Button type="button" size="sm" variant="outline">Edit</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent imports</CardTitle>
        </CardHeader>
        <CardContent>
          {(imports.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.data?.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link href={`/school/timetable/imports/${row.id}`} className="text-primary underline">
                        {row.originalFilename}
                      </Link>
                    </TableCell>
                    <TableCell>{formatStatusLabel(row.status)}</TableCell>
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
