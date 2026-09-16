"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { teachersService } from "@/services/teachers.service";
import { branchesService } from "@/services/branches.service";
import { academicsService } from "@/services/academics.service";
import type { Section } from "@/lib/types";
import { teacherDisplayNameFromUser } from "@/lib/person-name";
import { useToast } from "@/providers/toast-provider";
import { useAuth } from "@/providers/auth-provider";
import { ApiClientError } from "@/lib/api-client";
import { ArrowLeft } from "lucide-react";
import { gradeClassLabel, gradeClassNumber } from "@/lib/utils";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  branchId: z.string().min(1, "Select a branch"),
  employeeCode: z.string().min(1, "Required"),
  hireDate: z.string().optional(),
  gender: z.enum(["", "MALE", "FEMALE", "OTHER"]),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]),
});

type FormValues = z.infer<typeof schema>;

function hireDateValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

type ClassAssignmentRow = {
  id: string;
  sectionId: string | null;
  className?: string;
  classNumber?: number | null;
  sectionName?: string | null;
  subject: string | null;
  role: string;
};

function classHeadingFor(item: ClassAssignmentRow, sectionById: Map<string, Section>) {
  const section = item.sectionId ? sectionById.get(item.sectionId) : undefined;
  if (section?.grade) {
    const fromSection = gradeClassNumber({ name: section.name, grade: section.grade });
    if (fromSection != null) return `Class ${fromSection}`;
    const label = gradeClassLabel({ name: section.name, grade: section.grade });
    if (label !== "—") return label;
  }
  if (item.classNumber != null) return `Class ${item.classNumber}`;
  if (item.className && item.className !== "—") return item.className;
  return null;
}

export default function TeacherDetailsPage() {
  const params = useParams<{ id: string }>();
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = can("MANAGE_TEACHERS");

  const teacher = useQuery({
    queryKey: ["teacher", params.id],
    queryFn: () => teachersService.getById(params.id),
    enabled: Boolean(params.id),
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesService.list({ limit: 50 }),
    enabled: canEdit,
  });
  const sections = useQuery({
    queryKey: ["sections", "teacher-detail"],
    queryFn: () => academicsService.listSections({ limit: 200 }),
  });
  const sectionById = useMemo(() => {
    const map = new Map<string, Section>();
    for (const section of sections.data?.items ?? []) map.set(section.id, section);
    return map;
  }, [sections.data?.items]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      branchId: "",
      employeeCode: "",
      hireDate: "",
      gender: "",
      status: "ACTIVE",
    },
  });

  useEffect(() => {
    const row = teacher.data;
    if (!row) return;
    form.reset({
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      email: row.user.email,
      phone: row.user.phone ?? "",
      branchId: row.branch?.id ?? "",
      employeeCode: row.employeeCode,
      hireDate: hireDateValue(row.hireDate),
      gender: row.gender ?? "",
      status: (row.status as FormValues["status"]) || "ACTIVE",
    });
  }, [form, teacher.data]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      teachersService.update(params.id, {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        branchId: values.branchId,
        employeeCode: values.employeeCode,
        hireDate: values.hireDate || undefined,
        gender: values.gender || undefined,
        status: values.status,
      }),
    onSuccess: () => {
      toast({ title: "Teacher updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher", params.id] });
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
    },
    onError: (err) =>
      toast({
        title: "Could not update teacher",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

  if (teacher.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" phrases={["Opening teacher"]} />
      </div>
    );
  }

  if (!teacher.data) {
    return <div className="p-4 sm:p-6 lg:p-8">Teacher not found.</div>;
  }

  const row = teacher.data;
  const classes =
    row.assignments ??
    [
      ...(row.classSections ?? []).map((section) => ({
        id: `homeroom-${section.id}`,
        sectionId: section.id,
        className: gradeClassLabel(section),
        classNumber: gradeClassNumber(section),
        sectionName: section.name?.trim() || null,
        subject: null as string | null,
        role: "Class teacher" as const,
      })),
      ...(row.classSubjects ?? []).map((item) => ({
        id: item.id,
        sectionId: item.section?.id ?? null,
        className: gradeClassLabel(item.section),
        classNumber: gradeClassNumber(item.section),
        sectionName: item.section?.name?.trim() || null,
        subject: item.subject?.name ?? null,
        role: "Subject teacher" as const,
      })),
      ...(row.assistantClassSubjects ?? []).map((item) => ({
        id: `assistant-${item.id}`,
        sectionId: item.section?.id ?? null,
        className: gradeClassLabel(item.section),
        classNumber: gradeClassNumber(item.section),
        sectionName: item.section?.name?.trim() || null,
        subject: item.subject?.name ?? null,
        role: "Assistant" as const,
      })),
    ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={teacherDisplayNameFromUser(row.user, row.gender)}
        description={`${row.employeeCode} · ${row.user.username ?? row.user.email}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/school/teachers">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                All teachers
              </Button>
            </Link>
            {can("VIEW_TEACHER_PROGRESS") ? (
              <Link href={`/school/teachers/${params.id}/progress`}>
                <Button variant="outline">Progress</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Badge variant={row.status === "ACTIVE" ? "success" : "secondary"}>{row.status.replaceAll("_", " ")}</Badge>
        <span className="text-sm text-slate-500">{row.branch?.name ?? "No branch"}</span>
      </div>

      <form
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Teacher details</CardTitle>
            <CardDescription>
              {canEdit ? "Update contact, employment, and active status." : "Contact and employment information."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" disabled={!canEdit} {...form.register("firstName")} />
              {form.formState.errors.firstName ? (
                <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" disabled={!canEdit} {...form.register("lastName")} />
              {form.formState.errors.lastName ? (
                <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" disabled={!canEdit} {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" disabled={!canEdit} {...form.register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employeeCode">Employee code</Label>
              <Input id="employeeCode" disabled={!canEdit} {...form.register("employeeCode")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchId">Branch</Label>
              <Select id="branchId" disabled={!canEdit} {...form.register("branchId")}>
                <option value="">Select branch</option>
                {(branches.data?.items ?? (row.branch ? [row.branch] : [])).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hireDate">Hire date</Label>
              <Input id="hireDate" type="date" disabled={!canEdit} {...form.register("hireDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select id="gender" disabled={!canEdit} {...form.register("gender")}>
                <option value="">Not set</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" disabled={!canEdit} {...form.register("status")}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ON_LEAVE">On leave</option>
              </Select>
              <p className="text-xs text-slate-500">Inactive teachers cannot sign in.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
            <CardDescription>Class name on top. Section, subject, and role below.</CardDescription>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-sm text-slate-500">No classes assigned yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {classes.map((item) => {
                  const heading = classHeadingFor(item, sectionById);
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-2.5">
                      {heading ? (
                        item.sectionId ? (
                          <Link
                            href={`/school/classes/${item.sectionId}`}
                            className="font-medium text-slate-900 hover:underline"
                          >
                            {heading}
                          </Link>
                        ) : (
                          <p className="font-medium text-slate-900">{heading}</p>
                        )
                      ) : null}
                      <p className={heading ? "mt-0.5 text-sm text-slate-600" : "text-sm text-slate-600"}>
                        {[item.sectionName, item.subject, item.role].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {canEdit ? (
          <div className="flex justify-end gap-2">
            <Link href="/school/teachers">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
