"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/layout/page-loader";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { studentsService } from "@/services/students.service";
import { personFullName } from "@/lib/person-name";

export default function TeacherSectionStudentsPage() {
  const router = useRouter();
  const params = useParams<{ sectionId: string }>();
  const search = useSearchParams();
  const gradeName = search.get("grade") ?? "Class";
  const sectionName = search.get("section") ?? "";
  const subjectName = search.get("subject") ?? "";

  const rosterQuery = useQuery({
    queryKey: ["teacher-section-students", params.sectionId],
    queryFn: () => studentsService.listAll({ sectionId: params.sectionId, status: "ACTIVE" }),
  });

  const students = useMemo(() => {
    const items = rosterQuery.data?.items ?? [];
    return [...items].sort((a, b) =>
      personFullName(a.firstName, a.lastName).localeCompare(
        personFullName(b.firstName, b.lastName),
        undefined,
        { sensitivity: "base" },
      ),
    );
  }, [rosterQuery.data?.items]);

  const classLabel = sectionName ? `${gradeName} · ${sectionName}` : gradeName;
  const subtitle = [subjectName, `${students.length} students`].filter(Boolean).join(" · ");

  const studentHref = (studentId: string) => {
    const q = new URLSearchParams({
      from: "roster",
      sectionId: params.sectionId,
      grade: gradeName,
      section: sectionName,
      subject: subjectName,
    });
    return `/teacher/students/${studentId}?${q.toString()}`;
  };

  if (rosterQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={classLabel}
        description={subtitle || "Students in this section"}
        actions={
          <Link href="/teacher/classes">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              My classes
            </Button>
          </Link>
        }
      />

      <div className="rounded-lg border bg-card">
        {rosterQuery.isError ? (
          <p className="p-4 text-sm text-destructive">Could not load students for this section.</p>
        ) : !students.length ? (
          <p className="p-4 text-sm text-muted-foreground">No active students in this section yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Student ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow
                  key={student.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(studentHref(student.id))}
                >
                  <TableCell className="font-medium">
                    {personFullName(student.firstName, student.lastName)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{student.studentCode}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
