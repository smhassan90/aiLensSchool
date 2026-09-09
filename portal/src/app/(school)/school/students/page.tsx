"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { studentsService } from "@/services/students.service";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { personFullName, teacherDisplayNameFromUser } from "@/lib/person-name";
import { GraduationCap, Plus } from "lucide-react";

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [teacherId, setTeacherId] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const sections = useQuery({
    queryKey: ["sections"],
    queryFn: () => academicsService.listSections({ limit: 200 }),
  });
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => teachersService.list({ limit: 100 }),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["students", debounced, sectionId, teacherId],
    queryFn: () =>
      studentsService.list({
        limit: 100,
        search: debounced || undefined,
        sectionId: sectionId || undefined,
        teacherId: teacherId || undefined,
      }),
  });

  const classTeacherBySection = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections.data?.items ?? []) {
      if (section.classTeacher?.user) {
        map.set(
          section.id,
          teacherDisplayNameFromUser(section.classTeacher.user, section.classTeacher.gender),
        );
      }
    }
    return map;
  }, [sections.data]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (sectionId) {
      const section = sections.data?.items.find((s) => s.id === sectionId);
      parts.push(
        section ? `${section.grade?.name ?? ""} ${section.name}`.trim() : "selected class",
      );
    }
    if (teacherId) {
      const teacher = teachers.data?.items.find((t) => t.id === teacherId);
      parts.push(
        teacher
          ? personFullName(teacher.user?.firstName, teacher.user?.lastName)
          : "selected teacher",
      );
    }
    return parts;
  }, [sectionId, teacherId, sections.data, teachers.data]);

  const hasFilters = Boolean(debounced || sectionId || teacherId);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Students"
        description="Filter by class or teacher, then open a child for the full 360 view"
        actions={
          <Link href="/school/students/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add Student
            </Button>
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor="student-search">Search</Label>
          <Input
            id="student-search"
            placeholder="Name, code, parent name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="student-class">Class / section</Label>
          <Select
            id="student-class"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">All classes</option>
            {(sections.data?.items ?? []).map((section) => (
              <option key={section.id} value={section.id}>
                {section.grade?.name} {section.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="student-teacher">Teacher</Label>
          <Select
            id="student-teacher"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          >
            <option value="">All teachers</option>
            {(teachers.data?.items ?? []).map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {personFullName(teacher.user?.firstName, teacher.user?.lastName)}
                {teacher.employeeCode ? ` (${teacher.employeeCode})` : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {(sectionId || teacherId) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing students
            {filterSummary.length ? ` for ${filterSummary.join(" · ")}` : ""}
            {data?.total != null ? ` (${data.total})` : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSectionId("");
              setTeacherId("");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <PageLoader variant="panel" />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<GraduationCap className="h-10 w-10" />}
            title={hasFilters ? "No students match" : "No students yet"}
            description={
              hasFilters
                ? "Try another class or teacher, or clear the filters."
                : "Add your first student with parent details."
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setDebounced("");
                    setSectionId("");
                    setTeacherId("");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Link href="/school/students/new">
                  <Button>Add Student</Button>
                </Link>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Admission #</TableHead>
                <TableHead>Class / Section</TableHead>
                <TableHead>Class teacher</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">
                    <Link href={`/school/students/${student.id}`} className="hover:underline">
                      {student.firstName} {student.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{student.studentCode}</TableCell>
                  <TableCell>{student.admissionNumber}</TableCell>
                  <TableCell>
                    {student.grade?.name ?? "—"} / {student.section?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {student.section?.id
                      ? classTeacherBySection.get(student.section.id) ?? "—"
                      : "—"}
                  </TableCell>
                  <TableCell>{student.branch?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={student.status === "ACTIVE" ? "success" : "secondary"}>
                      {student.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/school/students/${student.id}`}>
                      <Button size="sm" variant="outline">
                        360 view
                      </Button>
                    </Link>
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
