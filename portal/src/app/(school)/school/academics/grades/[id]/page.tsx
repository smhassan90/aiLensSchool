"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { academicsService } from "@/services/academics.service";
import { branchesService } from "@/services/branches.service";
import { teachersService } from "@/services/teachers.service";
import { studentsService } from "@/services/students.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import type { ClassSubject, TeacherRef } from "@/lib/types";
import { ArrowLeft, Plus, Users } from "lucide-react";

const sectionSchema = z.object({
  name: z.string().min(1, "Required"),
  branchId: z.string().min(1, "Select a branch"),
  capacity: z.string().optional(),
});

const teacherSchema = z
  .object({
    academicYearId: z.string().min(1, "Select an academic year"),
    sectionId: z.string().min(1, "Select a section"),
    subjectId: z.string().min(1, "Select a subject"),
    teacherId: z.string().min(1, "Select a teacher"),
    assistantTeacherId: z.string().optional(),
  })
  .refine((v) => !v.assistantTeacherId || v.assistantTeacherId !== v.teacherId, {
    message: "Assistant must be a different teacher",
    path: ["assistantTeacherId"],
  });

const enrollSchema = z.object({
  academicYearId: z.string().min(1, "Select an academic year"),
  studentId: z.string().min(1, "Select a student"),
  sectionId: z.string().min(1, "Select a section"),
});

type SectionValues = z.infer<typeof sectionSchema>;
type TeacherValues = z.infer<typeof teacherSchema>;
type EnrollValues = z.infer<typeof enrollSchema>;

function teacherName(teacher?: TeacherRef | null) {
  if (!teacher) return "—";
  return `${teacher.user.firstName} ${teacher.user.lastName}`;
}

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sectionOpen, setSectionOpen] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const gradeQuery = useQuery({
    queryKey: ["grade", classId],
    queryFn: () => academicsService.getGrade(classId),
  });
  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicsService.listYears({ limit: 20 }),
  });
  const subjects = useQuery({
    queryKey: ["subjects"],
    queryFn: () => academicsService.listSubjects({ limit: 100 }),
  });
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => teachersService.list({ limit: 100 }),
  });
  const students = useQuery({
    queryKey: ["students"],
    queryFn: () => studentsService.list({ limit: 100 }),
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesService.list({ limit: 50 }),
  });
  const enrollments = useQuery({
    queryKey: ["enrollments", classId],
    queryFn: () => academicsService.listEnrollments({ gradeId: classId, limit: 100 }),
  });
  const assignments = useQuery({
    queryKey: ["class-subjects", classId],
    queryFn: () => academicsService.listClassSubjects({ gradeId: classId, limit: 100 }),
  });

  const grade = gradeQuery.data;
  const sections = grade?.sections ?? [];
  const singleSection = sections.length === 1 ? sections[0] : null;
  const currentYear = years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];
  const onlyBranch = branches.data?.items.length === 1 ? branches.data.items[0] : null;

  const sectionForm = useForm<SectionValues>({
    resolver: zodResolver(sectionSchema),
    defaultValues: { name: "A" },
  });
  const teacherForm = useForm<TeacherValues>({ resolver: zodResolver(teacherSchema) });
  const enrollForm = useForm<EnrollValues>({ resolver: zodResolver(enrollSchema) });
  const { setValue: setSectionValue } = sectionForm;

  useEffect(() => {
    if (onlyBranch) {
      setSectionValue("branchId", onlyBranch.id);
    }
  }, [onlyBranch, setSectionValue]);

  const availableStudents = useMemo(() => {
    const enrolledIds = new Set((enrollments.data?.items ?? []).map((item) => item.studentId));
    return (students.data?.items ?? []).filter((student) => !enrolledIds.has(student.id));
  }, [students.data, enrollments.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["grade", classId] });
    queryClient.invalidateQueries({ queryKey: ["grades"] });
    queryClient.invalidateQueries({ queryKey: ["sections"] });
    queryClient.invalidateQueries({ queryKey: ["enrollments", classId] });
    queryClient.invalidateQueries({ queryKey: ["class-subjects", classId] });
  };

  const addSection = useMutation({
    mutationFn: (values: SectionValues) =>
      academicsService.createSection({
        name: values.name,
        branchId: values.branchId || onlyBranch?.id || "",
        gradeId: classId,
        capacity: values.capacity ? Number(values.capacity) : undefined,
      }),
    onSuccess: () => {
      toast({ title: "Section added", variant: "success" });
      invalidate();
      setSectionOpen(false);
      sectionForm.reset({ name: "A" });
    },
    onError: (err) => {
      toast({
        title: "Could not add section",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const assignTeacher = useMutation({
    mutationFn: (values: TeacherValues) => {
      const section = sections.find((item) => item.id === values.sectionId);
      return academicsService.assignClassSubject({
        sectionId: values.sectionId,
        subjectId: values.subjectId,
        academicYearId: values.academicYearId,
        branchId: section?.branchId || onlyBranch?.id || "",
        teacherId: values.teacherId,
        assistantTeacherId: values.assistantTeacherId || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Teacher assigned", variant: "success" });
      invalidate();
      setTeacherOpen(false);
      teacherForm.reset();
    },
    onError: (err) => {
      toast({
        title: "Could not assign teacher",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const enrollStudent = useMutation({
    mutationFn: (values: EnrollValues) =>
      academicsService.createEnrollment({
        studentId: values.studentId,
        academicYearId: values.academicYearId,
        gradeId: classId,
        sectionId: values.sectionId,
      }),
    onSuccess: () => {
      toast({ title: "Student enrolled", variant: "success" });
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setEnrollOpen(false);
      enrollForm.reset();
    },
    onError: (err) => {
      toast({
        title: "Could not enroll student",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const openTeacherDialog = () => {
    teacherForm.reset({
      academicYearId: currentYear?.id ?? "",
      sectionId: singleSection?.id ?? "",
      subjectId: "",
      teacherId: "",
      assistantTeacherId: "",
    });
    setTeacherOpen(true);
  };

  const openEnrollDialog = () => {
    enrollForm.reset({
      academicYearId: currentYear?.id ?? "",
      studentId: "",
      sectionId: singleSection?.id ?? "",
    });
    setEnrollOpen(true);
  };

  if (gradeQuery.isLoading) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!grade) {
    return (
      <div className="p-8">
        <EmptyState
          title="Class not found"
          description="This class may have been removed."
          action={
            <Link href="/school/academics/grades">
              <Button variant="outline">Back to classes</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader
        title={grade.name}
        description={`Level ${grade.level}. Add sections, assign teachers (with optional assistants), then enroll students.`}
        actions={
          <div className="flex gap-2">
            <Link href={`/school/academics/grades/${classId}/analytics`}>
              <Button variant="outline">Class progress</Button>
            </Link>
            <Link href="/school/academics/grades">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
        }
      />

      <Tabs defaultValue="sections">
        <TabsList>
          <TabsTrigger value="sections">Sections ({sections.length})</TabsTrigger>
          <TabsTrigger value="teachers">Teachers ({assignments.data?.items.length ?? 0})</TabsTrigger>
          <TabsTrigger value="students">Students ({enrollments.data?.items.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="sections">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setSectionOpen(true)}>
              <Plus className="h-4 w-4" />
              Add section
            </Button>
          </div>
          {sections.length === 0 ? (
            <EmptyState
              icon={<Users className="h-10 w-10" />}
              title="No sections yet"
              description="Add section A if this class has only one group, or A, B, C if you split the class."
              action={<Button onClick={() => setSectionOpen(true)}>Add section</Button>}
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Subjects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map((section) => (
                    <TableRow key={section.id}>
                      <TableCell className="font-medium">{section.name}</TableCell>
                      <TableCell>{section.branch?.name ?? "—"}</TableCell>
                      <TableCell>{section.capacity ?? "—"}</TableCell>
                      <TableCell>{section._count?.enrollments ?? 0}</TableCell>
                      <TableCell>{section._count?.classSubjects ?? section.classSubjects?.length ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="teachers">
          <div className="mb-4 flex justify-end">
            <Button onClick={openTeacherDialog} disabled={!sections.length}>
              <Plus className="h-4 w-4" />
              Assign teacher
            </Button>
          </div>
          {!assignments.data?.items.length ? (
            <EmptyState
              title="No teachers assigned"
              description="Assign a subject teacher to a section. You can also add an assistant teacher."
              action={
                <Button onClick={openTeacherDialog} disabled={!sections.length}>
                  Assign teacher
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Assistant</TableHead>
                    <TableHead>Year</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.data.items.map((item: ClassSubject) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.section?.name ?? "—"}</TableCell>
                      <TableCell>{item.subject?.name ?? "—"}</TableCell>
                      <TableCell>{teacherName(item.teacher)}</TableCell>
                      <TableCell>{teacherName(item.assistantTeacher)}</TableCell>
                      <TableCell>{item.academicYear?.name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="students">
          <div className="mb-4 flex justify-end">
            <Button onClick={openEnrollDialog} disabled={!sections.length}>
              <Plus className="h-4 w-4" />
              Enroll student
            </Button>
          </div>
          {!enrollments.data?.items.length ? (
            <EmptyState
              title="No students in this class"
              description="Enroll students into the class and a section. If there is only one section, it is selected for you."
              action={
                <Button onClick={openEnrollDialog} disabled={!sections.length}>
                  Enroll student
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.student ? `${item.student.firstName} ${item.student.lastName}` : "—"}
                      </TableCell>
                      <TableCell>{item.student?.studentCode ?? "—"}</TableCell>
                      <TableCell>{item.section?.name ?? "—"}</TableCell>
                      <TableCell>{item.academicYear?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "ACTIVE" ? "success" : "secondary"}>
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={sectionOpen} onOpenChange={setSectionOpen}>
        <DialogContent onClose={() => setSectionOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add section</DialogTitle>
            <DialogDescription>
              Use A for a single-section class, or add B, C, and so on to split the class.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={sectionForm.handleSubmit((v) => addSection.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="sectionName">Section name</Label>
              <Input id="sectionName" placeholder="A" {...sectionForm.register("name")} />
              {sectionForm.formState.errors.name && (
                <p className="text-sm text-destructive">{sectionForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sectionBranch">Branch</Label>
              <Select id="sectionBranch" defaultValue={onlyBranch?.id} {...sectionForm.register("branchId")}>
                <option value="">Select branch</option>
                {branches.data?.items.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
              {sectionForm.formState.errors.branchId && (
                <p className="text-sm text-destructive">{sectionForm.formState.errors.branchId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity (optional)</Label>
              <Input id="capacity" type="number" min={1} {...sectionForm.register("capacity")} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSectionOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addSection.isPending}>
                {addSection.isPending ? "Adding…" : "Add section"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={teacherOpen} onOpenChange={setTeacherOpen}>
        <DialogContent onClose={() => setTeacherOpen(false)}>
          <DialogHeader>
            <DialogTitle>Assign teacher</DialogTitle>
            <DialogDescription>
              Assign a subject teacher to a section. Assistant is optional.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={teacherForm.handleSubmit((v) => assignTeacher.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="teacherYear">Academic year</Label>
              <Select id="teacherYear" {...teacherForm.register("academicYearId")}>
                <option value="">Select year</option>
                {years.data?.items.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </Select>
              {teacherForm.formState.errors.academicYearId && (
                <p className="text-sm text-destructive">{teacherForm.formState.errors.academicYearId.message}</p>
              )}
            </div>
            {singleSection ? (
              <>
                <input type="hidden" {...teacherForm.register("sectionId")} />
                <p className="text-sm text-muted-foreground">
                  Section <span className="font-medium text-foreground">{singleSection.name}</span> is selected
                  because this class has only one section.
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="teacherSection">Section</Label>
                <Select id="teacherSection" {...teacherForm.register("sectionId")}>
                  <option value="">Select section</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </Select>
                {teacherForm.formState.errors.sectionId && (
                  <p className="text-sm text-destructive">{teacherForm.formState.errors.sectionId.message}</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="subjectId">Subject</Label>
              <Select id="subjectId" {...teacherForm.register("subjectId")}>
                <option value="">Select subject</option>
                {subjects.data?.items.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name} ({subject.code})
                  </option>
                ))}
              </Select>
              {teacherForm.formState.errors.subjectId && (
                <p className="text-sm text-destructive">{teacherForm.formState.errors.subjectId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacherId">Teacher</Label>
              <Select id="teacherId" {...teacherForm.register("teacherId")}>
                <option value="">Select teacher</option>
                {teachers.data?.items.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.user.firstName} {teacher.user.lastName}
                  </option>
                ))}
              </Select>
              {teacherForm.formState.errors.teacherId && (
                <p className="text-sm text-destructive">{teacherForm.formState.errors.teacherId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="assistantTeacherId">Assistant (optional)</Label>
              <Select id="assistantTeacherId" {...teacherForm.register("assistantTeacherId")}>
                <option value="">None</option>
                {teachers.data?.items.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.user.firstName} {teacher.user.lastName}
                  </option>
                ))}
              </Select>
              {teacherForm.formState.errors.assistantTeacherId && (
                <p className="text-sm text-destructive">
                  {teacherForm.formState.errors.assistantTeacherId.message}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTeacherOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={assignTeacher.isPending}>
                {assignTeacher.isPending ? "Saving…" : "Assign"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent onClose={() => setEnrollOpen(false)}>
          <DialogHeader>
            <DialogTitle>Enroll student</DialogTitle>
            <DialogDescription>
              Place the student in this class and a section.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={enrollForm.handleSubmit((v) => enrollStudent.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="enrollYear">Academic year</Label>
              <Select id="enrollYear" {...enrollForm.register("academicYearId")}>
                <option value="">Select year</option>
                {years.data?.items.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </Select>
              {enrollForm.formState.errors.academicYearId && (
                <p className="text-sm text-destructive">{enrollForm.formState.errors.academicYearId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentId">Student</Label>
              <Select id="studentId" {...enrollForm.register("studentId")}>
                <option value="">Select student</option>
                {availableStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.firstName} {student.lastName} ({student.studentCode})
                  </option>
                ))}
              </Select>
              {enrollForm.formState.errors.studentId && (
                <p className="text-sm text-destructive">{enrollForm.formState.errors.studentId.message}</p>
              )}
            </div>
            {singleSection ? (
              <>
                <input type="hidden" {...enrollForm.register("sectionId")} />
                <p className="text-sm text-muted-foreground">
                  Section <span className="font-medium text-foreground">{singleSection.name}</span> is selected
                  because this class has only one section.
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="enrollSection">Section</Label>
                <Select id="enrollSection" {...enrollForm.register("sectionId")}>
                  <option value="">Select section</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </Select>
                {enrollForm.formState.errors.sectionId && (
                  <p className="text-sm text-destructive">{enrollForm.formState.errors.sectionId.message}</p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEnrollOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={enrollStudent.isPending}>
                {enrollStudent.isPending ? "Enrolling…" : "Enroll"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
