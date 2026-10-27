"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import { timetablesService } from "@/services/timetables.service";
import { TimetableValidationList } from "@/components/timetable/timetable-validation-list";
import { formatStatusLabel } from "@/lib/display-labels";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

export default function TimetableImportDetailPage() {
  const params = useParams();
  const importId = String(params.importId ?? "");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can("MANAGE_CLASSES");
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["timetable-import", importId],
    queryFn: () => timetablesService.getImport(importId),
    enabled: Boolean(importId),
  });

  const reExtract = useMutation({
    mutationFn: () => timetablesService.reExtractImport(importId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["timetable-import", importId] });
      toast({ title: "Re-extraction started", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Re-extract failed", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const discard = useMutation({
    mutationFn: () => timetablesService.discardImport(importId),
    onSuccess: () => {
      toast({ title: "Import discarded", variant: "success" });
      router.push("/school/timetable/imports");
    },
    onError: (err) => {
      toast({ title: "Discard failed", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  if (isLoading) return <PageLoader className="p-8" />;
  if (isError || !data) {
    return (
      <div className="p-8">
        <p className="text-destructive">Could not load import.</p>
        <Link href="/school/timetable/imports">
          <Button type="button" variant="outline" className="mt-4">Back</Button>
        </Link>
      </div>
    );
  }

  const warnings = Array.isArray(data.import.warnings) ? data.import.warnings : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title={data.import.originalFilename}
        description={`${formatStatusLabel(data.import.sourceType)} · ${formatStatusLabel(data.import.status)} · ${formatDate(data.import.createdAt)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/school/timetable/imports">
              <Button type="button" variant="outline" size="sm">All imports</Button>
            </Link>
            {canManage && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={reExtract.isPending}
                  onClick={() => reExtract.mutate()}
                >
                  Re-extract
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={discard.isPending}
                  onClick={() => discard.mutate()}
                >
                  Discard
                </Button>
              </>
            )}
          </div>
        }
      />

      {warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import warnings</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-muted-foreground">
                {typeof w === "object" && w !== null && "message" in w
                  ? String((w as { message: string }).message)
                  : JSON.stringify(w)}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {data.versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No draft versions were created. Fix extraction issues or create a manual draft for a section.
        </p>
      ) : (
        data.versions.map((v) => {
          const issues = Array.isArray(v.validation)
            ? (v.validation as import("@/services/timetables.service").TimetableValidationIssue[])
            : [];
          const sectionLabel = v.section
            ? `${v.section.grade.name} ${v.section.name}`
            : v.classLabel || "Unresolved section";
          const ambiguous = !v.sectionId || issues.some((i) => i.code.includes("AMBIGUOUS"));

          return (
            <Card key={v.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{sectionLabel}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatStatusLabel(v.status)} · {v.periods.length} periods
                    {ambiguous ? " · Needs section assignment" : ""}
                  </p>
                </div>
                <Link href={`/school/timetable/versions/${v.id}`}>
                  <Button type="button" size="sm">Open draft</Button>
                </Link>
              </CardHeader>
              <CardContent>
                <TimetableValidationList issues={issues} />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
