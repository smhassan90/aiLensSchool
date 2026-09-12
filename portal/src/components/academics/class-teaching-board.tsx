"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/layout/empty-state";
import { teacherDisplayNameFromUser } from "@/lib/person-name";
import type { ClassSubject, Section, TeacherRef } from "@/lib/types";
import { BookOpen, Plus } from "lucide-react";

function teacherName(teacher?: TeacherRef | null) {
  if (!teacher) return "Not assigned";
  return teacherDisplayNameFromUser(teacher.user, teacher.gender);
}

export function ClassTeachingBoard({
  sections,
  assignments = [],
  onAssign,
}: {
  sections: Section[];
  assignments?: ClassSubject[];
  onAssign: () => void;
}) {
  const boardSections = useMemo(() => {
    if (sections.some((section) => (section.classSubjects ?? []).length)) return sections;
    const bySection = new Map<string, ClassSubject[]>();
    for (const item of assignments) {
      const list = bySection.get(item.sectionId) ?? [];
      list.push(item);
      bySection.set(item.sectionId, list);
    }
    return sections.map((section) => ({
      ...section,
      classSubjects: bySection.get(section.id) ?? [],
    }));
  }, [sections, assignments]);

  const assignmentRows = boardSections.flatMap((section) =>
    (section.classSubjects ?? []).map((item) => ({ section, item })),
  );
  const subjectCount = new Set(assignmentRows.map(({ item }) => item.subjectId)).size;
  const missingTeachers = assignmentRows.filter(({ item }) => !item.teacherId).length;
  const teacherCount = new Set(
    assignmentRows.map(({ item }) => item.teacherId).filter(Boolean),
  ).size;

  if (!sections.length) {
    return (
      <EmptyState
        icon={<BookOpen className="h-10 w-10" />}
        title="Add a section first"
        description="Subjects and teachers are assigned per section of this class."
      />
    );
  }

  if (!assignmentRows.length) {
    return (
      <EmptyState
        icon={<BookOpen className="h-10 w-10" />}
        title="No subjects assigned to this class"
        description="Only subjects taught in this class are listed here, not the whole school catalogue."
        action={<Button onClick={onAssign}>Assign subject teacher</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-medium">Who teaches this class</h2>
          <p className="text-sm text-muted-foreground">
            {subjectCount} subject{subjectCount === 1 ? "" : "s"} · {teacherCount} teacher
            {teacherCount === 1 ? "" : "s"}
            {missingTeachers ? ` · ${missingTeachers} without a teacher` : ""}
          </p>
        </div>
        <Button onClick={onAssign}>
          <Plus className="h-4 w-4" />
          Assign subject teacher
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Subjects in this class</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{subjectCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Teachers assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{teacherCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Need a teacher</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{missingTeachers}</p>
          </CardContent>
        </Card>
      </div>

      {boardSections.map((section) => {
        const rows = (section.classSubjects ?? []) as ClassSubject[];
        return (
          <div key={section.id} className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h3 className="font-medium">Section {section.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Class teacher:{" "}
                  <span className={section.classTeacher ? "text-foreground" : "text-amber-700"}>
                    {section.classTeacher ? teacherName(section.classTeacher) : "Not assigned"}
                  </span>
                </p>
              </div>
              <Badge variant="secondary">{rows.length} subjects</Badge>
            </div>
            {rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Assistant</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.subject?.name ?? "Subject"}
                        {item.subject?.code ? (
                          <span className="ml-2 text-xs text-muted-foreground">{item.subject.code}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{item.teacher ? teacherName(item.teacher) : "—"}</TableCell>
                      <TableCell>{item.assistantTeacher ? teacherName(item.assistantTeacher) : "—"}</TableCell>
                      <TableCell>
                        {item.teacher ? (
                          <Badge variant="success">Assigned</Badge>
                        ) : (
                          <Badge variant="warning">Needs teacher</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No subjects for this section yet.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
