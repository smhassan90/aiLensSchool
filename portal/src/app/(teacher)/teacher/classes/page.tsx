"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useMemo } from "react";
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
import { EmptyState } from "@/components/layout/empty-state";
import { teachersService } from "@/services/teachers.service";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

function compareClasses(
  a: { gradeName: string; sectionName: string; subjectName: string },
  b: { gradeName: string; sectionName: string; subjectName: string },
) {
  const grade = a.gradeName.localeCompare(b.gradeName, undefined, { numeric: true, sensitivity: "base" });
  if (grade !== 0) return grade;
  const section = a.sectionName.localeCompare(b.sectionName, undefined, { numeric: true, sensitivity: "base" });
  if (section !== 0) return section;
  return a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" });
}

export default function TeacherClassesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const classes = useMemo(() => [...(data ?? [])].sort(compareClasses), [data]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
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
          <PageLoader variant="panel" />
        ) : !classes.length ? (
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
              {classes.map((cls) => (
                <TableRow
                  key={`${cls.sectionId}-${cls.subjectId}`}
                  className={cn(
                    cls.isClassTeacher && "border-l-2 border-l-primary bg-primary/5 hover:bg-primary/10",
                  )}
                >
                  <TableCell className="font-medium">{cls.gradeName}</TableCell>
                  <TableCell>{cls.sectionName}</TableCell>
                  <TableCell>
                    <Badge>{cls.subjectName}</Badge>
                  </TableCell>
                  <TableCell>
                    {cls.isClassTeacher ? (
                      <Badge variant="success">Class teacher</Badge>
                    ) : (
                      <Badge variant={cls.role === "ASSISTANT" ? "secondary" : "default"}>
                        {cls.role === "ASSISTANT" ? "Assistant" : "Subject teacher"}
                      </Badge>
                    )}
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
