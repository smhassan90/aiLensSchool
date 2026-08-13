"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { teachersService } from "@/services/teachers.service";
import { Users } from "lucide-react";

export default function TeacherClassesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="My Classes"
        description="Sections and subjects assigned to you"
      />

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No classes assigned"
            description="Contact your school admin to assign subjects and sections."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Role</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((cls) => (
                <TableRow key={`${cls.sectionId}-${cls.subjectId}`}>
                  <TableCell className="font-medium">{cls.gradeName}</TableCell>
                  <TableCell>{cls.sectionName}</TableCell>
                  <TableCell>
                    <Badge>{cls.subjectName}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={cls.role === "ASSISTANT" ? "secondary" : "default"}>
                      {cls.role === "ASSISTANT" ? "Assistant" : "Teacher"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {cls.gradeId && (
                      <Link href={`/teacher/classes/${cls.gradeId}/analytics`}>
                        <Button size="sm" variant="outline">Progress</Button>
                      </Link>
                    )}
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
