"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { SchoolLogoUpload } from "@/components/schools/school-logo-upload";
import { schoolsService } from "@/services/schools.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

type FormValues = z.infer<typeof schema>;

function statusVariant(status: string) {
  switch (status) {
    case "ACTIVE":
      return "success" as const;
    case "SUSPENDED":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export default function EditSchoolPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const schoolId = params.id;

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [existingLogo, setExistingLogo] = useState<string | null>(null);

  const schoolQuery = useQuery({
    queryKey: ["school", schoolId],
    queryFn: () => schoolsService.getById(schoolId),
    enabled: Boolean(schoolId),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!schoolQuery.data) return;
    const school = schoolQuery.data;
    reset({
      name: school.name,
      email: school.email,
      phone: school.phone ?? "",
      address: school.address ?? "",
      city: school.city ?? "",
      country: school.country ?? "",
      status: school.status as FormValues["status"],
    });
    setExistingLogo(school.logo ?? null);
    setLogoFile(null);
  }, [schoolQuery.data, reset]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      let logo: string | null = existingLogo;
      if (logoFile) {
        const uploaded = await schoolsService.uploadLogo(logoFile);
        logo = uploaded.url;
      }
      return schoolsService.update(schoolId, {
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        address: values.address || undefined,
        city: values.city || undefined,
        country: values.country || undefined,
        status: values.status,
        logo,
      });
    },
    onSuccess: (school) => {
      queryClient.invalidateQueries({ queryKey: ["schools"] });
      queryClient.invalidateQueries({ queryKey: ["school", schoolId] });
      toast({
        title: "School updated",
        description: `${school.name} has been saved.`,
        variant: "success",
      });
      router.push("/super-admin/schools");
    },
    onError: (err) => {
      toast({
        title: "Failed to update school",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  if (schoolQuery.isLoading) {
    return <PageLoader variant="page" />;
  }

  if (schoolQuery.isError || !schoolQuery.data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(schoolQuery.error as Error)?.message ?? "School not found"}
        </div>
        <Link href="/super-admin/schools" className="mt-4 inline-block">
          <Button variant="outline">Back to schools</Button>
        </Link>
      </div>
    );
  }

  const school = schoolQuery.data;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={school.name}
        description={`Edit school details and logo · Code ${school.code}`}
        actions={
          <Link href="/super-admin/schools">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>School Details</CardTitle>
                <CardDescription>Update contact information, status, and branding</CardDescription>
              </div>
              <Badge variant={statusVariant(school.status)}>{school.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">School Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">School Code</Label>
              <Input id="code" value={school.code} disabled />
              <p className="text-xs text-muted-foreground">School code cannot be changed.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" {...register("status")}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
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
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register("country")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register("address")} />
            </div>
            <div className="sm:col-span-2">
              <SchoolLogoUpload
                value={existingLogo}
                file={logoFile}
                onFileChange={setLogoFile}
                onClear={() => setExistingLogo(null)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">{formatDate(school.createdAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Branches</p>
              <p className="font-medium">{school.branches?.length ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Students</p>
              <p className="font-medium">{school._count?.students ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Teachers</p>
              <p className="font-medium">{school._count?.teachers ?? "—"}</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/super-admin/schools">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
