"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { academicsService } from "@/services/academics.service";
import { ClipboardList } from "lucide-react";

export default function EnrollmentsPage() {
  const enrollments = useQuery({
    queryKey: ["enrollments"],
    queryFn: () => academicsService.listEnrollments({ limit: 100 }),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Enrollments"
        description="Students are placed in a class and a section. Manage this from the class page."
        actions={
          <Link href="/school/academics/grades">
            <Button>Manage classes</Button>
          </Link>
        }
      />

      <div className="rounded-lg border bg-card">
        {enrollments.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !enrollments.data?.items.length ? (
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="No enrollments yet"
            description="Open a class and enroll students into a section."
            action={
              <Link href="/school/academics/grades">
                <Button>Go to classes</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.student ? `${item.student.firstName} ${item.student.lastName}` : "—"}
                  </TableCell>
                  <TableCell>
                    {item.grade ? (
                      <Link href={`/school/academics/grades/${item.gradeId}`} className="hover:underline">
                        {item.grade.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{item.section?.name ?? "—"}</TableCell>
                  <TableCell>{item.academicYear?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "ACTIVE" ? "success" : "secondary"}>
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
