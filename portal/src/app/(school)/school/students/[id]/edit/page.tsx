"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { studentsService } from "@/services/students.service";
import { branchesService } from "@/services/branches.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import type { Student, StudentParentLink } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().optional(),
  studentCode: z.string().min(1, "Required"),
  admissionNumber: z.string().min(1, "Required"),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  branchId: z.string().min(1, "Select a branch"),
  gradeId: z.string().min(1, "Select a class"),
  sectionId: z.string().min(1, "Select a section"),
  academicYearId: z.string().min(1, "Select an academic year"),
  address: z.string().optional(),
  scienceGroup: z.string().optional(),
  fatherFirstName: z.string().optional(),
  fatherLastName: z.string().optional(),
  fatherPhone: z.string().optional(),
  fatherEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  motherFirstName: z.string().optional(),
  motherLastName: z.string().optional(),
  motherPhone: z.string().optional(),
  motherEmail: z.string().email("Valid email required").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

function parentByRelationship(parents: StudentParentLink[] | undefined, relationship: string) {
  return parents?.find((p) => p.relationship === relationship);
}

function activeEnrollment(student: Student) {
  return student.enrollments?.find((e) => e.status === "ACTIVE") ?? student.enrollments?.[0];
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function valuesFromStudent(student: Student): FormValues {
  const enrollment = activeEnrollment(student);
  const father = parentByRelationship(student.parents, "FATHER");
  const mother = parentByRelationship(student.parents, "MOTHER");
  return {
    firstName: student.firstName,
    lastName: student.lastName || "",
    studentCode: student.studentCode,
    admissionNumber: student.admissionNumber,
    dateOfBirth: toDateInput(student.dateOfBirth),
    gender: student.gender ?? "",
    branchId: student.branchId ?? student.branch?.id ?? "",
    gradeId: enrollment?.gradeId ?? enrollment?.grade?.id ?? student.grade?.id ?? "",
    sectionId: enrollment?.sectionId ?? enrollment?.section?.id ?? student.section?.id ?? "",
    academicYearId: enrollment?.academicYearId ?? enrollment?.academicYear?.id ?? "",
    address: student.address ?? "",
    scienceGroup: student.scienceGroup ?? "",
    fatherFirstName: father?.parent?.user?.firstName ?? "",
    fatherLastName: father?.parent?.user?.lastName ?? "",
    fatherPhone: father?.parent?.phone || father?.parent?.user?.phone || "",
    fatherEmail: father?.parent?.user?.email ?? "",
    motherFirstName: mother?.parent?.user?.firstName ?? "",
    motherLastName: mother?.parent?.user?.lastName ?? "",
    motherPhone: mother?.parent?.phone || mother?.parent?.user?.phone || "",
    motherEmail: mother?.parent?.user?.email ?? "",
  };
}

export default function EditStudentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const studentQuery = useQuery({
    queryKey: ["student", params.id],
    queryFn: () => studentsService.getById(params.id),
  });

  const branches = useQuery({ queryKey: ["branches"], queryFn: () => branchesService.list({ limit: 50 }) });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const grades = useQuery({ queryKey: ["grades"], queryFn: () => academicsService.listGrades({ limit: 20 }) });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (studentQuery.data) {
      reset(valuesFromStudent(studentQuery.data));
    }
  }, [studentQuery.data, reset]);

  const branchId = watch("branchId");
  const gradeId = watch("gradeId");

  const sections = useQuery({
    queryKey: ["sections", branchId, gradeId],
    queryFn: () =>
      academicsService.listSections({
        limit: 50,
        branchId: branchId || undefined,
        gradeId: gradeId || undefined,
      }),
    enabled: !!branchId && !!gradeId,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      studentsService.update(params.id, {
        firstName: values.firstName,
        lastName: values.lastName?.trim() || undefined,
        studentCode: values.studentCode.trim(),
        admissionNumber: values.admissionNumber.trim(),
        dateOfBirth: values.dateOfBirth || undefined,
        gender: values.gender || undefined,
        branchId: values.branchId,
        gradeId: values.gradeId,
        sectionId: values.sectionId,
        academicYearId: values.academicYearId,
        address: values.address?.trim() || undefined,
        scienceGroup: values.scienceGroup || undefined,
        father: values.fatherFirstName?.trim()
          ? {
              firstName: values.fatherFirstName.trim(),
              lastName: values.fatherLastName || undefined,
              phone: values.fatherPhone || undefined,
              email: values.fatherEmail || undefined,
            }
          : undefined,
        mother: values.motherFirstName?.trim()
          ? {
              firstName: values.motherFirstName.trim(),
              lastName: values.motherLastName || undefined,
              phone: values.motherPhone || undefined,
              email: values.motherEmail || undefined,
            }
          : undefined,
      }),
    onSuccess: () => {
      toast({ title: "Student updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["student", params.id] });
      queryClient.invalidateQueries({ queryKey: ["student-360", params.id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      router.push(`/school/students/${params.id}`);
    },
    onError: (err) => {
      toast({
        title: "Could not save student",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  if (studentQuery.isLoading || branches.isLoading || years.isLoading || grades.isLoading) {
    return <PageLoader variant="page" />;
  }

  if (!studentQuery.data) {
    return <div className="p-4 sm:p-6 lg:p-8">Student not found.</div>;
  }

  const backHref = `/school/students/${params.id}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Edit student"
        description="Update enrollment, contact details, and parent information."
        actions={
          <Link href={backHref}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to 360
            </Button>
          </Link>
        }
      />

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="mx-auto max-w-3xl space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Student information</CardTitle>
            <CardDescription>Basic details and class placement</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name (optional)</Label>
              <Input id="lastName" {...register("lastName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentCode">Student ID</Label>
              <Input id="studentCode" {...register("studentCode")} />
              {errors.studentCode && <p className="text-sm text-destructive">{errors.studentCode.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="admissionNumber">Admission number</Label>
              <Input id="admissionNumber" {...register("admissionNumber")} />
              {errors.admissionNumber && (
                <p className="text-sm text-destructive">{errors.admissionNumber.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select id="gender" {...register("gender")}>
                <option value="">Select</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Home address</Label>
              <Input id="address" {...register("address")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchId">Branch</Label>
              <Select id="branchId" {...register("branchId")}>
                <option value="">Select branch</option>
                {branches.data?.items.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
              {errors.branchId && <p className="text-sm text-destructive">{errors.branchId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="academicYearId">Academic year</Label>
              <Select id="academicYearId" {...register("academicYearId")}>
                <option value="">Select year</option>
                {years.data?.items.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </Select>
              {errors.academicYearId && (
                <p className="text-sm text-destructive">{errors.academicYearId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="gradeId">Class</Label>
              <Select id="gradeId" {...register("gradeId")}>
                <option value="">Select class</option>
                {[...(grades.data?.items ?? [])]
                  .sort(
                    (a, b) =>
                      a.level - b.level ||
                      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
                  )
                  .map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
              </Select>
              {errors.gradeId && <p className="text-sm text-destructive">{errors.gradeId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sectionId">Section</Label>
              <Select id="sectionId" {...register("sectionId")} disabled={!branchId || !gradeId}>
                <option value="">Select section</option>
                {sections.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              {errors.sectionId && <p className="text-sm text-destructive">{errors.sectionId.message}</p>}
            </div>
            {(() => {
              const grade = grades.data?.items.find((g) => g.id === gradeId);
              const name = grade?.name?.toLowerCase() ?? "";
              const needsStream =
                grade?.level === 9 || grade?.level === 10 || /\b(9|10|ix|x)\b/.test(name);
              if (!needsStream) return null;
              return (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="scienceGroup">Science group (Class 9–10)</Label>
                  <Select id="scienceGroup" {...register("scienceGroup")}>
                    <option value="">Not set yet</option>
                    <option value="COMPUTER">Comp. science</option>
                    <option value="BIOLOGY">Bio. science</option>
                  </Select>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Father</CardTitle>
            <CardDescription>App login username is not changed here; update phone only if the school re-issues credentials.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fatherFirstName">First name</Label>
              <Input id="fatherFirstName" {...register("fatherFirstName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fatherLastName">Last name</Label>
              <Input id="fatherLastName" {...register("fatherLastName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fatherPhone">Phone</Label>
              <Input id="fatherPhone" {...register("fatherPhone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fatherEmail">Email (optional)</Label>
              <Input id="fatherEmail" type="email" {...register("fatherEmail")} />
              {errors.fatherEmail && <p className="text-sm text-destructive">{errors.fatherEmail.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mother</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="motherFirstName">First name</Label>
              <Input id="motherFirstName" {...register("motherFirstName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherLastName">Last name</Label>
              <Input id="motherLastName" {...register("motherLastName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherPhone">Phone</Label>
              <Input id="motherPhone" {...register("motherPhone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherEmail">Email (optional)</Label>
              <Input id="motherEmail" type="email" {...register("motherEmail")} />
              {errors.motherEmail && <p className="text-sm text-destructive">{errors.motherEmail.message}</p>}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={backHref}>
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
