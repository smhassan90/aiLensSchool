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
import { GraduationCap, Search, UserSquare2 } from "lucide-react";

export function SchoolRosterExplorer() {
  const [tab, setTab] = useState("students");
  const [gradeId, setGradeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [teacherId, setTeacherId] = useState("");
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

  const classSubjects = useQuery({
    queryKey: ["roster-class-subjects", gradeId, sectionId],
    queryFn: () =>
      fetchAllPages((page, limit) =>
        academicsService.listClassSubjects({
          page,
          limit,
          gradeId: gradeId || undefined,
          sectionId: sectionId || undefined,
        }),
      ),
    enabled: tab === "teaching",
  });

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
    if (!q) return rows;
    return rows.filter((row) => {
      const student = row.student;
      if (!student) return false;
      const blob = `${student.firstName} ${student.lastName} ${student.studentCode}`.toLowerCase();
      return blob.includes(q);
    });
  }, [enrollments.data, studentSearch, teacherId, teacherSectionIds]);

  const teachingRows = useMemo(() => {
    return (classSubjects.data ?? []).filter((row) => {
      if (!teacherId) return true;
      return row.teacherId === teacherId || row.assistantTeacherId === teacherId;
    });
  }, [classSubjects.data, teacherId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class & roster explorer"
        description="Filter by class, section, teacher, or student name. Switch between enrolled students and who teaches each subject."
      />

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="roster-grade">Class</Label>
          <Select
            id="roster-grade"
            value={gradeId}
            onChange={(e) => {
              setGradeId(e.target.value);
              setSectionId("");
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
        <div className="space-y-2">
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
            <UserSquare2 className="mr-1.5 h-4 w-4" />
            Subject teachers ({teachingRows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-4">
          {enrollments.isLoading ? (
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <Link href={`/school/students/${row.studentId}`} className="hover:underline">
                          {row.student?.firstName} {row.student?.lastName}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.student?.studentCode ?? "—"}</TableCell>
                      <TableCell>{row.grade?.name ?? "—"}</TableCell>
                      <TableCell>{row.section?.name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="teaching" className="mt-4">
          {classSubjects.isLoading ? (
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
