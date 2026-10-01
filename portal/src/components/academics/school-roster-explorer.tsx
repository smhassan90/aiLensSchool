"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import { personFullName, teacherDisplayNameFromUser } from "@/lib/person-name";
import { cn, gradeClassLabel } from "@/lib/utils";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { Enrollment, Subject } from "@/lib/types";
import { subjectIdsWithSameName, uniqueSubjectsForPicker } from "@/lib/unique-subjects";
import { ChevronDown, Search, UserSquare2 } from "lucide-react";

type RosterGroup = {
  id: string;
  sectionId: string;
  classLabel: string;
  sectionName: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string;
};

function compareGroups(a: RosterGroup, b: RosterGroup) {
  const cls = a.classLabel.localeCompare(b.classLabel, undefined, { numeric: true, sensitivity: "base" });
  if (cls !== 0) return cls;
  const sec = a.sectionName.localeCompare(b.sectionName, undefined, { numeric: true, sensitivity: "base" });
  if (sec !== 0) return sec;
  const sub = a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" });
  if (sub !== 0) return sub;
  return a.teacherName.localeCompare(b.teacherName, undefined, { sensitivity: "base" });
}

function enrollmentsMatchingSearch(enrollments: Enrollment[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return enrollments;
  return enrollments.filter((row) => {
    const student = row.student;
    if (!student) return false;
    const blob = `${student.firstName} ${student.lastName} ${student.studentCode}`.toLowerCase();
    return blob.includes(q);
  });
}

export function SchoolRosterExplorer() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const teachingRows = useMemo(() => {
    let rows = rosterAssignments.data ?? [];
    if (subjectId && subjectIdSet) {
      rows = rows.filter((row) => subjectIdSet.has(row.subjectId));
    }
    return rows;
  }, [rosterAssignments.data, subjectId, subjectIdSet]);

  const enrollmentsBySection = useMemo(() => {
    const map = new Map<string, Enrollment[]>();
    for (const row of enrollments.data ?? []) {
      const list = map.get(row.sectionId) ?? [];
      list.push(row);
      map.set(row.sectionId, list);
    }
    for (const [key, list] of map) {
      list.sort((a, b) =>
        personFullName(a.student?.firstName, a.student?.lastName).localeCompare(
          personFullName(b.student?.firstName, b.student?.lastName),
          undefined,
          { sensitivity: "base" },
        ),
      );
      map.set(key, list);
    }
    return map;
  }, [enrollments.data]);

  const rosterGroups = useMemo(() => {
    const groups: RosterGroup[] = teachingRows.map((row) => ({
      id: row.id,
      sectionId: row.sectionId,
      classLabel: gradeClassLabel(row.section),
      sectionName: row.section?.name ?? "—",
      subjectName: row.subject?.name ?? "—",
      teacherId: row.teacherId ?? null,
      teacherName: row.teacher
        ? teacherDisplayNameFromUser(row.teacher.user, row.teacher.gender)
        : "Not assigned",
    }));

    const q = studentSearch.trim();
    const filtered = q
      ? groups.filter((group) => {
          const sectionEnrollments = enrollmentsBySection.get(group.sectionId) ?? [];
          return enrollmentsMatchingSearch(sectionEnrollments, q).length > 0;
        })
      : groups;

    return [...filtered].sort(compareGroups);
  }, [teachingRows, enrollmentsBySection, studentSearch]);

  const totalStudentsShown = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const group of rosterGroups) {
      const rows = enrollmentsMatchingSearch(
        enrollmentsBySection.get(group.sectionId) ?? [],
        studentSearch,
      );
      for (const row of rows) {
        if (seen.has(row.studentId)) continue;
        seen.add(row.studentId);
        count += 1;
      }
    }
    return count;
  }, [rosterGroups, enrollmentsBySection, studentSearch]);

  const toggleExpanded = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const isLoading = enrollments.isLoading || rosterAssignments.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class & roster explorer"
        description="Each row is a class, section, subject, and teacher. Click a row to expand and see enrolled students."
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
              setExpandedId(null);
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
            onChange={(e) => {
              setSectionId(e.target.value);
              setExpandedId(null);
            }}
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
            onChange={(e) => {
              setSubjectId(e.target.value);
              setExpandedId(null);
            }}
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
          <Select
            id="roster-teacher"
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setExpandedId(null);
            }}
          >
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

      <p className="text-sm text-muted-foreground">
        {rosterGroups.length} teaching group{rosterGroups.length === 1 ? "" : "s"} · {totalStudentsShown} student
        {totalStudentsShown === 1 ? "" : "s"} in view
      </p>

      {isLoading ? (
        <PageLoader variant="panel" />
      ) : !rosterGroups.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <UserSquare2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No class–subject rows match these filters. Try another class or clear subject/teacher filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" aria-label="Expand" />
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead className="text-right tabular-nums">Students</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rosterGroups.map((group) => {
                const open = expandedId === group.id;
                const sectionStudents = enrollmentsMatchingSearch(
                  enrollmentsBySection.get(group.sectionId) ?? [],
                  studentSearch,
                );
                return (
                  <Fragment key={group.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => toggleExpanded(group.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleExpanded(group.id);
                        }
                      }}
                    >
                      <TableCell>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            open && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </TableCell>
                      <TableCell className="font-medium">{group.classLabel}</TableCell>
                      <TableCell>{group.sectionName}</TableCell>
                      <TableCell>{group.subjectName}</TableCell>
                      <TableCell>
                        {group.teacherId ? (
                          <Link
                            href={`/school/teachers/${group.teacherId}/overview`}
                            className="hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {group.teacherName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{group.teacherName}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{sectionStudents.length}</TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow key={`${group.id}-students`} className="hover:bg-transparent">
                        <td colSpan={6} className="bg-muted/20 p-0 align-middle">
                          {sectionStudents.length ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Student</TableHead>
                                  <TableHead>Student ID</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sectionStudents.map((row) => (
                                  <TableRow key={row.id}>
                                    <TableCell className="font-medium">
                                      <Link
                                        href={`/school/students/${row.studentId}`}
                                        className="hover:underline"
                                      >
                                        {personFullName(row.student?.firstName, row.student?.lastName)}
                                      </Link>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                      {row.student?.studentCode ?? "—"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <p className="p-4 text-sm text-muted-foreground">
                              No active students in this section.
                            </p>
                          )}
                        </td>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
