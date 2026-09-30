"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatStatusLabel } from "@/lib/display-labels";
import type { Student } from "@/lib/types";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { personFullName, studentMatchesQuery, teacherDisplayNameFromUser } from "@/lib/person-name";
import { GraduationCap, Plus } from "lucide-react";

type StudentStatusConfirm = {
  student: Student;
  nextStatus: "ACTIVE" | "INACTIVE";
};

export default function StudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusConfirm, setStatusConfirm] = useState<StudentStatusConfirm | null>(null);
  const sectionId = searchParams.get("sectionId") ?? "";
  const teacherId = searchParams.get("teacherId") ?? "";
  const status = searchParams.get("status") ?? "";

  const setFilter = (key: "sectionId" | "teacherId" | "status", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/school/students?${qs}` : "/school/students");
  };

  const sections = useQuery({
    queryKey: ["sections"],
    queryFn: () => academicsService.listSections({ limit: 100 }),
  });
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => teachersService.list({ limit: 100 }),
  });

  const setStudentStatus = useMutation({
    mutationFn: ({ studentId, nextStatus }: { studentId: string; nextStatus: "ACTIVE" | "INACTIVE" }) =>
      studentsService.update(studentId, { status: nextStatus }),
    onSuccess: (_, { nextStatus }) => {
      setStatusConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["students-roster"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast({
        title: nextStatus === "INACTIVE" ? "Student marked inactive" : "Student reactivated",
        variant: "success",
      });
    },
    onError: (err) =>
      toast({
        title: "Could not update status",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["students-roster", sectionId, teacherId, status],
    queryFn: () =>
      studentsService.listAll({
        sectionId: sectionId || undefined,
        teacherId: teacherId || undefined,
        status: status || undefined,
      }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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

  const classTeachers = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        gender?: string | null;
        user?: { firstName?: string | null; lastName?: string | null } | null;
        employeeCode?: string | null;
      }
    >();
    for (const section of sections.data?.items ?? []) {
      if (section.classTeacher?.id) {
        map.set(section.classTeacher.id, section.classTeacher);
      }
    }
    for (const teacher of teachers.data?.items ?? []) {
      if (map.has(teacher.id)) {
        map.set(teacher.id, { ...map.get(teacher.id)!, employeeCode: teacher.employeeCode });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      personFullName(a.user?.firstName, a.user?.lastName).localeCompare(
        personFullName(b.user?.firstName, b.user?.lastName),
      ),
    );
  }, [sections.data, teachers.data]);

  const classOptions = useMemo(() => {
    return [...(sections.data?.items ?? [])].sort((a, b) => {
      const levelA = a.grade?.level ?? Number.POSITIVE_INFINITY;
      const levelB = b.grade?.level ?? Number.POSITIVE_INFINITY;
      if (levelA !== levelB) return levelA - levelB;
      const gradeName = (a.grade?.name ?? "").localeCompare(b.grade?.name ?? "", undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (gradeName !== 0) return gradeName;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [sections.data]);

  const items = useMemo(() => {
    const rows = data?.items ?? [];
    return search.trim() ? rows.filter((student) => studentMatchesQuery(student, search)) : rows;
  }, [data?.items, search]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (sectionId) {
      const section = sections.data?.items.find((s) => s.id === sectionId);
      parts.push(
        section ? `${section.grade?.name ?? ""} ${section.name}`.trim() : "selected class",
      );
    }
    if (teacherId) {
      const teacher = classTeachers.find((t) => t.id === teacherId);
      parts.push(
        teacher
          ? teacherDisplayNameFromUser(teacher.user, teacher.gender)
          : "selected class teacher",
      );
    }
    if (status) {
      parts.push(status === "ACTIVE" ? "active" : status.toLowerCase());
    }
    return parts;
  }, [sectionId, teacherId, status, sections.data, classTeachers]);

  const hasFilters = Boolean(search.trim() || sectionId || teacherId || status);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Students"
        description="Filter by class or class teacher, then open a child for the full 360 view"
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
            placeholder="Name, code, class — instant, no wait"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="student-class">Class / section</Label>
          <Select
            id="student-class"
            value={sectionId}
            onChange={(e) => setFilter("sectionId", e.target.value)}
          >
            <option value="">All classes</option>
            {classOptions.map((section) => (
              <option key={section.id} value={section.id}>
                {section.grade?.name} {section.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="student-teacher">Class teacher</Label>
          <Select
            id="student-teacher"
            value={teacherId}
            onChange={(e) => setFilter("teacherId", e.target.value)}
          >
            <option value="">All class teachers</option>
            {classTeachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacherDisplayNameFromUser(teacher.user, teacher.gender)}
                {teacher.employeeCode ? ` (${teacher.employeeCode})` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="student-status">Status</Label>
          <Select id="student-status" value={status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="GRADUATED">Graduated</option>
          </Select>
        </div>
      </div>

      {(search.trim() || sectionId || teacherId || status) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing {items.length}
            {data?.items.length != null ? ` of ${data.items.length}` : ""}
            {filterSummary.length ? ` for ${filterSummary.join(" · ")}` : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              router.replace("/school/students");
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
        ) : !items.length ? (
          <EmptyState
            icon={<GraduationCap className="h-10 w-10" />}
            title={hasFilters ? "No students match" : "No students yet"}
            description={
              hasFilters
                ? "Try another name, class or teacher, or clear the filters."
                : "Add your first student with parent details."
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    router.replace("/school/students");
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
                <TableHead>Student ID</TableHead>
                <TableHead>Class / Section</TableHead>
                <TableHead>Class teacher</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((student) => (
                <TableRow
                  key={student.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => router.push(`/school/students/${student.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/school/students/${student.id}`);
                    }
                  }}
                >
                  <TableCell className="font-medium">
                    <span className="hover:underline">{personFullName(student.firstName, student.lastName)}</span>
                  </TableCell>
                  <TableCell>
                    {student.studentCode}
                    {student.admissionNumber && student.admissionNumber !== student.studentCode ? (
                      <span className="block text-xs text-muted-foreground">
                        Adm. {student.admissionNumber}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {student.grade?.name ?? "—"} / {student.section?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {student.section?.classTeacher
                      ? teacherDisplayNameFromUser(
                          student.section.classTeacher.user,
                          student.section.classTeacher.gender,
                        )
                      : student.section?.id
                        ? classTeacherBySection.get(student.section.id) ?? "—"
                        : "—"}
                  </TableCell>
                  <TableCell>{student.branch?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={student.status === "ACTIVE" ? "success" : "secondary"}>
                      {formatStatusLabel(student.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/school/students/${student.id}/edit`);
                        }}
                      >
                        Edit
                      </Button>
                      {student.status === "INACTIVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setStatusConfirm({ student, nextStatus: "ACTIVE" });
                          }}
                        >
                          Activate
                        </Button>
                      ) : student.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setStatusConfirm({ student, nextStatus: "INACTIVE" });
                          }}
                        >
                          Deactivate
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/school/students/${student.id}`);
                        }}
                      >
                        360 view
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={Boolean(statusConfirm)} onOpenChange={(open) => { if (!open) setStatusConfirm(null); }}>
        <DialogContent onClose={() => setStatusConfirm(null)}>
          <DialogHeader>
            <DialogTitle>
              {statusConfirm?.nextStatus === "INACTIVE" ? "Deactivate student?" : "Reactivate student?"}
            </DialogTitle>
            <DialogDescription>
              {statusConfirm
                ? statusConfirm.nextStatus === "INACTIVE"
                  ? `${personFullName(statusConfirm.student.firstName, statusConfirm.student.lastName)} stays on record but is treated as inactive in rosters and reports.`
                  : `${personFullName(statusConfirm.student.firstName, statusConfirm.student.lastName)} will show as active again.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStatusConfirm(null)} disabled={setStudentStatus.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!statusConfirm || setStudentStatus.isPending}
              onClick={() =>
                statusConfirm &&
                setStudentStatus.mutate({
                  studentId: statusConfirm.student.id,
                  nextStatus: statusConfirm.nextStatus,
                })
              }
            >
              {setStudentStatus.isPending ? "Saving…" : statusConfirm?.nextStatus === "INACTIVE" ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
