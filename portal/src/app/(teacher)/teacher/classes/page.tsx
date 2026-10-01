"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
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
import type { TeacherClass } from "@/lib/types";
import { cn } from "@/lib/utils";
import { teacherClassDetailHref } from "@/lib/teacher-class-links";
import { Users } from "lucide-react";

function compareClasses(a: TeacherClass, b: TeacherClass) {
  const grade = a.gradeName.localeCompare(b.gradeName, undefined, { numeric: true, sensitivity: "base" });
  if (grade !== 0) return grade;
  const section = a.sectionName.localeCompare(b.sectionName, undefined, { numeric: true, sensitivity: "base" });
  if (section !== 0) return section;
  return a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" });
}

export default function TeacherClassesPage() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const classes = useMemo(
    () =>
      [...new Map(
        (data ?? []).map((cls) => [`${cls.sectionId}:${cls.subjectId}`, cls] as const),
      ).values()].sort(compareClasses),
    [data],
  );

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
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[14%]">Class</TableHead>
                <TableHead className="w-[12%]">Section</TableHead>
                <TableHead className="w-[22%]">Subject</TableHead>
                <TableHead className="w-[26%]">Role</TableHead>
                <TableHead className="w-[12%]">Students</TableHead>
                <TableHead className="w-[14%] text-right">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((cls) => {
                const detailHref = teacherClassDetailHref(cls);
                return (
                  <TableRow
                    key={`${cls.sectionId}-${cls.subjectId}`}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      cls.isClassTeacher && "border-l-2 border-l-primary bg-primary/5 hover:bg-primary/10",
                    )}
                    tabIndex={0}
                    onClick={() => router.push(detailHref)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(detailHref);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{cls.gradeName}</TableCell>
                    <TableCell>{cls.sectionName}</TableCell>
                    <TableCell className="truncate">{cls.subjectName}</TableCell>
                    <TableCell>
                      {cls.isClassTeacher ? (
                        <Badge variant="success" className="font-normal">Class teacher</Badge>
                      ) : (
                        <Badge variant={cls.role === "ASSISTANT" ? "secondary" : "outline"} className="font-normal">
                          {cls.role === "ASSISTANT" ? "Assistant" : "Subject teacher"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{cls.studentCount ?? 0}</TableCell>
                    <TableCell className="text-right">
                      {cls.gradeId ? (
                        <Link
                          href={`/teacher/classes/${cls.gradeId}/analytics?sectionId=${cls.sectionId}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Button size="sm" variant="outline" className="min-w-[5.5rem]">
                            Progress
                          </Button>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
