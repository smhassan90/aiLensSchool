"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { timetablesService } from "@/services/timetables.service";
import { TimetableVersionEditor } from "@/components/timetable/timetable-version-editor";
import { formatStatusLabel } from "@/lib/display-labels";

export default function TimetableVersionPage() {
  const params = useParams();
  const versionId = String(params.versionId ?? "");
  const { can } = useAuth();
  const canManage = can("MANAGE_CLASSES");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["timetable-version", versionId],
    queryFn: () => timetablesService.getVersion(versionId),
    enabled: Boolean(versionId),
  });

  if (isLoading) return <PageLoader className="p-8" />;
  if (isError || !data) {
    return (
      <div className="p-8">
        <p className="text-destructive">Could not load timetable version.</p>
        <Link href="/school/timetable/manage">
          <Button type="button" variant="outline" className="mt-4">Back</Button>
        </Link>
      </div>
    );
  }

  const sectionLabel = `${data.version.section.grade.name} ${data.version.section.name}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title={`${sectionLabel} timetable`}
        description={`Version ${data.version.versionNumber} · ${formatStatusLabel(data.version.status)} · revision ${data.version.revision}`}
        actions={
          <Link href="/school/timetable/manage">
            <Button type="button" variant="outline" size="sm">Manage</Button>
          </Link>
        }
      />
      <TimetableVersionEditor
        versionId={versionId}
        initial={data}
        canEdit={canManage && data.version.status === "DRAFT"}
        onPublished={() => void refetch()}
      />
    </div>
  );
}
