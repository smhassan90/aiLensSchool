"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { teacherDisplayNameFromUser } from "@/lib/person-name";
import { gradeClassLabel } from "@/lib/utils";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { ClassSubject, Subject } from "@/lib/types";
import { subjectIdsWithSameName, uniqueSubjectsForPicker } from "@/lib/unique-subjects";
import { BookOpen, GraduationCap, Search, UserSquare2 } from "lucide-react";

type TeachingPair = {
  subject: string;
  teacherId: string | null;
  teacherName: string;
};

function teachingPairsForSection(
  sectionId: string,
  assignments: ClassSubject[],
  subjectIdSet: Set<string> | null,
  filterTeacherId: string,
): TeachingPair[] {
  let rows = assignments.filter((row) => row.sectionId === sectionId);
  if (subjectIdSet) {
    rows = rows.filter((row) => subjectIdSet.has(row.subjectId));
  }
  if (filterTeacherId) {
    rows = rows.filter(
      (row) => row.teacherId === filterTeacherId || row.assistantTeacherId === filterTeacherId,
    );
  }

  const seen = new Set<string>();
  const pairs: TeachingPair[] = [];
  for (const row of rows) {
    const subject = row.subject?.name ?? "—";
    const teacher = row.teacher;
    const teacherName = teacher
      ? teacherDisplayNameFromUser(teacher.user, teacher.gender)
      : "Not assigned";
    const key = `${subject.toLowerCase()}::${row.teacherId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      subject,
      teacherId: row.teacherId ?? null,
      teacherName,
    });
  }
  pairs.sort((a, b) => a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" }));
  return pairs;
}

export function SchoolRosterExplorer() {
  const [tab, setTab] = useState("students");
  const [gradeId, setGradeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const grades = useQuery({
    queryKey: ["grades"],
    queryFn: () => academicsService.listGrades({ limit: 100 }),
  });
  const sections = useQuery({
    queryKey: ["sections", gradeId],
    queryFn: () => academicsService.listSections({ gradeId, limit: 100 }),
    enabled: Boolean(gradeId),
  });
  const subjectsCatalogue = useQuery({
    queryKey: ["subjects", "roster-catalogue"],
    queryFn: () => fetchAllPages((page, limit) => academicsService.listSubjects({ page, limit })),
  });
  const teachers = useQuery({
    queryKey: ["teachers", "roster"],
    queryFn: () =>
      fetchAllPages((page, limit) => teachersService.list({ page, limit, status: "ACTIVE" })),
  });
  const enrollments = useQuery({
    queryKey: ["roster-enrollments", gradeId, sectionId],
    queryFn: () =>
      fetchAllPages((page, limit) =>
        academicsService.listEnrollments({
          page,
          limit,
          gradeId: gradeId || undefined,
          sectionId: sectionId || undefined,
          status: "ACTIVE",
        }),
      ),
    enabled: tab === "students",
  });
  const teacherAssignments = useQuery({
    queryKey: ["roster-teacher-assignments", teacherId],
    queryFn: () =>
      fetchAllPages((page, limit) =>
        academicsService.listClassSubjects({ page, limit, teacherId: teacherId! }),
      ),
    enabled: Boolean(teacherId),
  });

  const rosterAssignments = useQuery({
    queryKey: ["roster-class-subjects", gradeId, sectionId, teacherId],
    queryFn: () =>
      fetchAllPages((page, limit) =>
        academicsService.listClassSubjects({
          page,
          limit,
          gradeId: gradeId || undefined,
          sectionId: sectionId || undefined,
          teacherId: teacherId || undefined,
        }),
      ),
    enabled:
      tab === "students" ||
      tab === "teaching" ||
      Boolean(gradeId || sectionId || teacherId || subjectId),
  });

  const catalogueItems = subjectsCatalogue.data ?? [];

  const subjectIdSet = useMemo(() => {
    if (!subjectId) return null;
    return subjectIdsWithSameName(catalogueItems, subjectId);
  }, [subjectId, catalogueItems]);

  const subjectOptions = useMemo(() => {
    const fromAssignments = (rosterAssignments.data ?? [])
      .map((row) => row.subject)
      .filter((s): s is Subject => Boolean(s?.id && s?.name));
    if (fromAssignments.length) {
      return uniqueSubjectsForPicker(fromAssignments, gradeId || undefined);
    }
    return uniqueSubjectsForPicker(catalogueItems, gradeId || undefined);
  }, [rosterAssignments.data, catalogueItems, gradeId]);

  const subjectSectionIds = useMemo(() => {
    if (!subjectId || !subjectIdSet) return null;
    const rows = rosterAssignments.data ?? [];
    return new Set(
      rows.filter((row) => subjectIdSet.has(row.subjectId)).map((row) => row.sectionId),
    );
  }, [subjectId, subjectIdSet, rosterAssignments.data]);

  const teacherSectionIds = useMemo(() => {
    if (!teacherId) return null;
    const ids = new Set<string>();
    for (const row of teacherAssignments.data ?? []) {
      ids.add(row.sectionId);
    }
    return ids;
  }, [teacherId, teacherAssignments.data]);

  const studentRows = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    let rows = enrollments.data ?? [];
    if (teacherId && teacherSectionIds) {
      rows = rows.filter((row) => teacherSectionIds.has(row.sectionId));
    }
    if (subjectId && subjectSectionIds) {
      rows = rows.filter((row) => subjectSectionIds.has(row.sectionId));
    }
    if (!q) return rows;
    return rows.filter((row) => {
      const student = row.student;
      if (!student) return false;
      const blob = `${student.firstName} ${student.lastName} ${student.studentCode}`.toLowerCase();
      return blob.includes(q);
    });
  }, [enrollments.data, studentSearch, teacherId, teacherSectionIds, subjectId, subjectSectionIds]);

  const teachingRows = useMemo(() => {
    let rows = rosterAssignments.data ?? [];
    if (subjectId && subjectIdSet) {
      rows = rows.filter((row) => subjectIdSet.has(row.subjectId));
    }
    return rows;
  }, [rosterAssignments.data, subjectId, subjectIdSet]);

  const assignmentRows = rosterAssignments.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class & roster explorer"
        description="Filter by class, section, subject, teacher, or student name. Switch between enrolled students and who teaches each subject."
      />

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="space-y-2">
          <Label htmlFor="roster-grade">Class</Label>
          <Select
            id="roster-grade"
            value={gradeId}
            onChange={(e) => {
              setGradeId(e.target.value);
              setSectionId("");
              setSubjectId("");
            }}
          >
            <option value="">All classes</option>
            {(grades.data?.items ?? []).map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="roster-section">Section</Label>
          <Select
            id="roster-section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={!gradeId}
          >
            <option value="">All sections</option>
            {(sections.data?.items ?? []).map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="roster-subject">Subject</Label>
          <Select
            id="roster-subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">All subjects</option>
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
                {subject.code ? ` (${subject.code})` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="roster-teacher">Teacher</Label>
          <Select id="roster-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">All teachers</option>
            {(teachers.data ?? []).map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacherDisplayNameFromUser(teacher.user, teacher.gender)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2 lg:col-span-1 xl:col-span-1">
          <Label htmlFor="roster-student">Student search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="roster-student"
              className="pl-9"
              placeholder="Name or student ID"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="students" value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="students">
            <GraduationCap className="mr-1.5 h-4 w-4" />
            Students ({studentRows.length})
          </TabsTrigger>
          <TabsTrigger value="teaching">
            <BookOpen className="mr-1.5 h-4 w-4" />
            Subject teachers ({teachingRows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-4">
          {enrollments.isLoading || rosterAssignments.isLoading ? (
            <PageLoader variant="panel" />
          ) : !studentRows.length ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No students match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Teacher</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentRows.map((row) => {
                    const pairs = teachingPairsForSection(
                      row.sectionId,
                      assignmentRows,
                      subjectIdSet,
                      teacherId,
                    );
                    return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <Link href={`/school/students/${row.studentId}`} className="hover:underline">
                          {row.student?.firstName} {row.student?.lastName}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.student?.studentCode ?? "—"}</TableCell>
                      <TableCell>{row.grade?.name ?? "—"}</TableCell>
                      <TableCell>{row.section?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {pairs.length ? (
                          <span className="flex flex-col gap-0.5">
                            {pairs.map((pair) => (
                              <span key={`${pair.subject}-${pair.teacherId ?? "none"}`}>{pair.subject}</span>
                            ))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {pairs.length ? (
                          <span className="flex flex-col gap-0.5">
                            {pairs.map((pair) =>
                              pair.teacherId ? (
                                <Link
                                  key={`${pair.subject}-${pair.teacherId}`}
                                  href={`/school/teachers/${pair.teacherId}/overview`}
                                  className="hover:underline"
                                >
                                  {pair.teacherName}
                                </Link>
                              ) : (
                                <span key={pair.subject} className="text-muted-foreground">
                                  {pair.teacherName}
                                </span>
                              ),
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="teaching" className="mt-4">
          {rosterAssignments.isLoading ? (
            <PageLoader variant="panel" />
          ) : !teachingRows.length ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No subject assignments match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Assistant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachingRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{gradeClassLabel(row.section)}</TableCell>
                      <TableCell>{row.section?.name ?? "—"}</TableCell>
                      <TableCell>{row.subject?.name ?? "—"}</TableCell>
                      <TableCell>
                        {row.teacher ? (
                          <Link
                            href={`/school/teachers/${row.teacherId}/overview`}
                            className="hover:underline"
                          >
                            {teacherDisplayNameFromUser(row.teacher.user, row.teacher.gender)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {row.assistantTeacher
                          ? teacherDisplayNameFromUser(
                              row.assistantTeacher.user,
                              row.assistantTeacher.gender,
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
