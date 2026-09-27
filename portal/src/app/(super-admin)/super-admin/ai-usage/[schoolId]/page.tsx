"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
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
import { platformService } from "@/services/platform.service";

export default function SchoolAiUsagePage() {
  const params = useParams<{ schoolId: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["platform-ai-school", params.schoolId],
    queryFn: () => platformService.getSchoolAiUsage(params.schoolId),
  });

  if (query.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-destructive">School not found.</p>
      </div>
    );
  }

  const { school, totals, teachers } = query.data;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={school.name}
        description={`${totals.totalTokens.toLocaleString()} tokens · ${totals.requestCount} AI requests`}
        actions={
          <Link href="/super-admin/ai-usage">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              All schools
            </Button>
          </Link>
        }
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Teacher</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teachers.map((teacher) => (
              <TableRow
                key={teacher.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() =>
                  router.push(`/super-admin/ai-usage/${params.schoolId}/teachers/${teacher.id}`)
                }
              >
                <TableCell className="font-medium">{teacher.name}</TableCell>
                <TableCell>{teacher.employeeCode}</TableCell>
                <TableCell className="text-right">{teacher.ai.requestCount}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {teacher.ai.totalTokens.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
