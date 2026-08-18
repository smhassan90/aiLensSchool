"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { schoolsService } from "@/services/schools.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().min(2, "Code is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  branchName: z.string().min(2, "Branch name is required"),
  branchCode: z.string().min(2, "Branch code is required"),
  branchAddress: z.string().optional(),
  adminFirstName: z.string().min(1, "Required"),
  adminLastName: z.string().min(1, "Required"),
  adminEmail: z.string().email("Valid email required"),
  adminPhone: z.string().optional(),
  adminPassword: z.string().min(8, "Minimum 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function NewSchoolPage() {
  const router = useRouter();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      country: "Pakistan",
      branchName: "Main Campus",
      branchCode: "MAIN",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      schoolsService.create({
        name: values.name,
        code: values.code,
        email: values.email,
        phone: values.phone,
        address: values.address,
        city: values.city,
        country: values.country,
        branch: {
          name: values.branchName,
          code: values.branchCode,
          address: values.branchAddress,
        },
        admin: {
          firstName: values.adminFirstName,
          lastName: values.adminLastName,
          email: values.adminEmail,
          phone: values.adminPhone,
          password: values.adminPassword,
        },
      }),
    onSuccess: (school) => {
      toast({
        title: "School created",
        description: `${school.name} has been onboarded successfully.`,
        variant: "success",
      });
      router.push("/super-admin/schools");
    },
    onError: (err) => {
      toast({
        title: "Failed to create school",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Create School"
        description="Onboard a new school with an initial branch and admin account"
        actions={
          <Link href="/super-admin/schools">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>School Details</CardTitle>
            <CardDescription>Basic information about the school</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">School Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">School Code</Label>
              <Input id="code" {...register("code")} placeholder="ABC" />
              {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">School Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register("address")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Initial Branch</CardTitle>
            <CardDescription>First campus for this school</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="branchName">Branch Name</Label>
              <Input id="branchName" {...register("branchName")} />
              {errors.branchName && (
                <p className="text-sm text-destructive">{errors.branchName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchCode">Branch Code</Label>
              <Input id="branchCode" {...register("branchCode")} />
              {errors.branchCode && (
                <p className="text-sm text-destructive">{errors.branchCode.message}</p>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="branchAddress">Branch Address</Label>
              <Input id="branchAddress" {...register("branchAddress")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>School Admin</CardTitle>
            <CardDescription>Primary administrator account</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adminFirstName">First Name</Label>
              <Input id="adminFirstName" {...register("adminFirstName")} />
              {errors.adminFirstName && (
                <p className="text-sm text-destructive">{errors.adminFirstName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminLastName">Last Name</Label>
              <Input id="adminLastName" {...register("adminLastName")} />
              {errors.adminLastName && (
                <p className="text-sm text-destructive">{errors.adminLastName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">Email</Label>
              <Input id="adminEmail" type="email" {...register("adminEmail")} />
              {errors.adminEmail && (
                <p className="text-sm text-destructive">{errors.adminEmail.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPhone">Phone</Label>
              <Input id="adminPhone" {...register("adminPhone")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="adminPassword">Password</Label>
              <Input id="adminPassword" type="password" {...register("adminPassword")} />
              {errors.adminPassword && (
                <p className="text-sm text-destructive">{errors.adminPassword.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/super-admin/schools">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create School"}
          </Button>
        </div>
      </form>
    </div>
  );
}
