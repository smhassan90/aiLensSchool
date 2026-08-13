"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { studentsService, type ParentCredential } from "@/services/students.service";
import { branchesService } from "@/services/branches.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { ArrowLeft } from "lucide-react";

const schema = z
  .object({
    firstName: z.string().min(1, "Required"),
    lastName: z.string().min(1, "Required"),
    studentCode: z.string().min(1, "Required"),
    admissionNumber: z.string().min(1, "Required"),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    branchId: z.string().min(1, "Select a branch"),
    gradeId: z.string().min(1, "Select a class"),
    sectionId: z.string().min(1, "Select a section"),
    academicYearId: z.string().min(1, "Select an academic year"),
    fatherFirstName: z.string().optional(),
    fatherLastName: z.string().optional(),
    fatherPhone: z.string().optional(),
    fatherEmail: z.string().email("Valid email required").optional().or(z.literal("")),
    motherFirstName: z.string().optional(),
    motherLastName: z.string().optional(),
    motherPhone: z.string().optional(),
    motherEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  })
  .refine((v) => Boolean(v.fatherFirstName?.trim() || v.motherFirstName?.trim()), {
    message: "Enter at least mother or father so we can create a mobile login",
    path: ["fatherFirstName"],
  });

type FormValues = z.infer<typeof schema>;

export default function NewStudentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<ParentCredential[] | null>(null);

  const branches = useQuery({ queryKey: ["branches"], queryFn: () => branchesService.list({ limit: 50 }) });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const grades = useQuery({ queryKey: ["grades"], queryFn: () => academicsService.listGrades({ limit: 20 }) });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

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
      studentsService.create({
        firstName: values.firstName,
        lastName: values.lastName,
        studentCode: values.studentCode,
        admissionNumber: values.admissionNumber,
        dateOfBirth: values.dateOfBirth || undefined,
        gender: values.gender || undefined,
        branchId: values.branchId,
        gradeId: values.gradeId,
        sectionId: values.sectionId,
        academicYearId: values.academicYearId,
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
    onSuccess: (result) => {
      toast({ title: "Student created", variant: "success" });
      setCredentials(result.credentials);
    },
    onError: (err) => {
      toast({
        title: "Failed to create student",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const loadingMeta = branches.isLoading || years.isLoading || grades.isLoading;

  return (
    <div className="p-8">
      <PageHeader
        title="Add Student"
        description="Mother and father mobile logins are generated automatically. Share the username and password with each parent."
        actions={
          <Link href="/school/students">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      {loadingMeta ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="mx-auto max-w-3xl space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle>Student Information</CardTitle>
              <CardDescription>Basic student details and enrollment</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" {...register("firstName")} />
                {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" {...register("lastName")} />
                {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="studentCode">Student Code</Label>
                <Input id="studentCode" {...register("studentCode")} />
                {errors.studentCode && <p className="text-sm text-destructive">{errors.studentCode.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="admissionNumber">Admission Number</Label>
                <Input id="admissionNumber" {...register("admissionNumber")} />
                {errors.admissionNumber && <p className="text-sm text-destructive">{errors.admissionNumber.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
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
                <Label htmlFor="academicYearId">Academic Year</Label>
                <Select id="academicYearId" {...register("academicYearId")}>
                  <option value="">Select year</option>
                  {years.data?.items.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </Select>
                {errors.academicYearId && <p className="text-sm text-destructive">{errors.academicYearId.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="gradeId">Class</Label>
                <Select id="gradeId" {...register("gradeId")}>
                  <option value="">Select class</option>
                  {grades.data?.items.map((g) => (
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Father</CardTitle>
              <CardDescription>A username and password will be generated for the parent app. Last name defaults to the student&apos;s.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fatherFirstName">First name</Label>
                <Input id="fatherFirstName" {...register("fatherFirstName")} />
                {errors.fatherFirstName && <p className="text-sm text-destructive">{errors.fatherFirstName.message}</p>}
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
              <CardDescription>Separate login from the father. If this parent already exists (same phone or email), they will be linked instead.</CardDescription>
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
            <Link href="/school/students">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create student and parent logins"}
            </Button>
          </div>
        </form>
      )}

      <Dialog open={Boolean(credentials)} onOpenChange={(open) => { if (!open) router.push("/school/students"); }}>
        <DialogContent onClose={() => router.push("/school/students")}>
          <DialogHeader>
            <DialogTitle>Parent app logins</DialogTitle>
            <DialogDescription>
              Write these down and give them to the mother and father. Passwords are shown only once. They can change the password after logging in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(credentials ?? []).map((item) => (
              <div key={item.relationship} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{item.relationship === "FATHER" ? "Father" : "Mother"} · {item.name}</p>
                <p className="mt-1">Username: <span className="font-mono">{item.username}</span></p>
                <p>
                  Password:{" "}
                  {item.existing ? (
                    <span className="text-muted-foreground">Already has an account — use the existing password</span>
                  ) : (
                    <span className="font-mono">{item.password}</span>
                  )}
                </p>
              </div>
            ))}
            <Button className="w-full" onClick={() => window.print()}>Print</Button>
            <Button className="w-full" variant="outline" onClick={() => router.push("/school/students")}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
