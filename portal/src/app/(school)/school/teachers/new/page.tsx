"use client";

import { PageLoader } from "@/components/layout/page-loader";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { teachersService } from "@/services/teachers.service";
import { branchesService } from "@/services/branches.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  phone: z.string().optional(),
  password: z.string().min(8, "Minimum 8 characters"),
  branchId: z.string().min(1, "Select a branch"),
  employeeCode: z.string().optional(),
  hireDate: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]),
});

type FormValues = z.infer<typeof schema>;

export default function NewTeacherPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesService.list({ limit: 50 }),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: "ACTIVE" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const phone = values.phone?.trim();
      const employeeCode = values.employeeCode?.trim();
      const hireDate = values.hireDate?.trim();
      return teachersService.create({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        password: values.password,
        branchId: values.branchId,
        status: values.status,
        ...(phone ? { phone } : {}),
        ...(employeeCode ? { employeeCode } : {}),
        ...(hireDate ? { hireDate } : {}),
      });
    },
    onSuccess: (created) => {
      toast({
        title: "Teacher created",
        description: created.username
          ? `Login username: ${created.username}`
          : created.employeeCode
            ? `Employee code: ${created.employeeCode}`
            : undefined,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["device-mapping-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance-teachers"] });
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      router.push("/school/teachers");
    },
    onError: (err) => {
      toast({
        title: "Failed to create teacher",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Add Teacher"
        description="Create a new teacher account"
        actions={
          <Link href="/school/teachers">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      {branches.isLoading ? (
        <PageLoader variant="page" />
      ) : (
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="mx-auto max-w-3xl space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle>Teacher Details</CardTitle>
              <CardDescription>
                A unique login username is generated from your school code and employee ID. Teachers sign in
                with that username, not an email address.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...register("firstName")} />
                {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...register("lastName")} />
                {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
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
                <Label htmlFor="status">Status</Label>
                <Select id="status" {...register("status")}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ON_LEAVE">On leave</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hireDate">Hire date</Label>
                <Input id="hireDate" type="date" {...register("hireDate")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employeeCode">Employee code (optional)</Label>
                <Input
                  id="employeeCode"
                  {...register("employeeCode")}
                  placeholder="Leave blank for SCHOOL-0001 style ID"
                />
                {errors.employeeCode && <p className="text-sm text-destructive">{errors.employeeCode.message}</p>}
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Employee code is used for biometric devices and attendance. Leave blank to assign the next code
                with your school prefix.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/school/teachers">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create Teacher"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
