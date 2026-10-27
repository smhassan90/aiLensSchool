"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { timetablesService } from "@/services/timetables.service";
import { formatStatusLabel } from "@/lib/display-labels";
import { formatDate } from "@/lib/utils";

export default function TimetableImportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["timetable-imports"],
    queryFn: () => timetablesService.listImports({ page: 1, limit: 50 }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Timetable imports"
        description="Review extraction results and open draft versions."
        actions={
          <Link href="/school/timetable/manage">
            <Button type="button" variant="outline" size="sm">Back to manage</Button>
          </Link>
        }
      />
      {isLoading && <PageLoader />}
      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/school/timetable/imports/${row.id}`} className="font-medium text-primary underline">
                    {row.originalFilename}
                  </Link>
                </TableCell>
                <TableCell>{formatStatusLabel(row.sourceType)}</TableCell>
                <TableCell>{formatStatusLabel(row.status)}</TableCell>
                <TableCell>{formatDate(row.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
