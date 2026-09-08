"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { academicsService } from "@/services/academics.service";
import { branchesService } from "@/services/branches.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatPkr, optionalMoney } from "@/lib/money";
import { ClassFeeFields } from "@/components/academics/class-fee-fields";
import { BookOpen, Plus } from "lucide-react";

const schema = z
  .object({
    name: z.string().min(1, "Required"),
    level: z.coerce.number().int().min(1, "Level must be 1 or higher"),
    stageId: z.string().optional(),
    createDefaultSection: z.boolean(),
    branchId: z.string().optional(),
    defaultSectionName: z.string().optional(),
    defaultSectionCapacity: z.string().optional(),
    admissionFee: z.string().optional(),
    tuitionFee: z.string().optional(),
  })
  .refine((v) => !v.createDefaultSection || Boolean(v.branchId), {
    message: "Select a branch for the default section",
    path: ["branchId"],
  });

type FormValues = z.infer<typeof schema>;

export default function ClassesPage() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const classes = useQuery({
    queryKey: ["grades"],
    queryFn: () => academicsService.listGrades({ limit: 100 }),
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesService.list({ limit: 50 }),
  });
  const stages = useQuery({
    queryKey: ["school-stages"],
    queryFn: () => academicsService.listStages(),
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      createDefaultSection: true,
      defaultSectionName: "A",
      admissionFee: "",
      tuitionFee: "",
    },
  });

  const createDefaultSection = watch("createDefaultSection");
  const onlyBranch = branches.data?.items.length === 1 ? branches.data.items[0] : null;

  useEffect(() => {
    if (onlyBranch) {
      setValue("branchId", onlyBranch.id);
    }
  }, [onlyBranch, setValue]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      academicsService.createGrade({
        name: values.name,
        level: values.level,
        stageId: values.stageId || undefined,
        createDefaultSection: values.createDefaultSection,
        branchId: values.branchId || onlyBranch?.id,
        defaultSectionName: values.defaultSectionName || "A",
        defaultSectionCapacity: values.defaultSectionCapacity
          ? Number(values.defaultSectionCapacity)
          : undefined,
        admissionFee: optionalMoney(values.admissionFee),
        tuitionFee: optionalMoney(values.tuitionFee),
      }),
    onSuccess: () => {
      toast({ title: "Class created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["sections"] });
      queryClient.invalidateQueries({ queryKey: ["school-stages"] });
      reset({
        createDefaultSection: true,
        defaultSectionName: "A",
        name: "",
        level: 1,
        stageId: "",
        admissionFee: "",
        tuitionFee: "",
      });
      setOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Could not create class",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Classes"
        description="Each class has its own fee amounts. Set monthly tuition when you add the class."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Class
          </Button>
        }
      />

      {classes.isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(classes.error as Error).message}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {classes.isLoading ? (
          <PageLoader variant="panel" />
        ) : !classes.data?.items.length ? (
          <EmptyState
            icon={<BookOpen className="h-10 w-10" />}
            title="No classes yet"
            description="Add a class such as Grade 1 or Class 5. Schools with one section can create that section automatically."
            action={<Button onClick={() => setOpen(true)}>Add Class</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>School section</TableHead>
                <TableHead>Classroom</TableHead>
                <TableHead>Monthly tuition</TableHead>
                <TableHead>Students</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <Link href={`/school/academics/grades/${item.id}`} className="hover:underline">
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>{item.stage?.name ?? "—"}</TableCell>
                  <TableCell>
                    {item.sections?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {item.sections.map((section) => (
                          <Badge key={section.id} variant="secondary">
                            {section.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.tuitionFee != null && Number(item.tuitionFee) > 0 ? (
                      formatPkr(item.tuitionFee)
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>{item._count?.enrollments ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add class</DialogTitle>
            <DialogDescription>
              Name the class, then set its fees. Tuition can differ by class — for example Class 1–8 vs Class 9–10.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit((v) => mutation.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="name">Class name</Label>
              <Input id="name" placeholder="Grade 1" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Input id="level" type="number" min={1} {...register("level")} />
              {errors.level && <p className="text-sm text-destructive">{errors.level.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="stageId">School section</Label>
              <Select id="stageId" {...register("stageId")}>
                <option value="">Not assigned</option>
                {(stages.data ?? []).map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Example: Level 1–2 under Pre-Primary, Class 1–5 under Primary, Class 6–10 under Secondary.
              </p>
            </div>
            <ClassFeeFields
              admissionFee={watch("admissionFee") ?? ""}
              tuitionFee={watch("tuitionFee") ?? ""}
              onAdmissionFeeChange={(value) => setValue("admissionFee", value)}
              onTuitionFeeChange={(value) => setValue("tuitionFee", value)}
            />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" {...register("createDefaultSection")} />
              <span>
                This class has only one section
                <span className="block text-muted-foreground">
                  Creates section A now. You can add more sections later if needed.
                </span>
              </span>
            </label>
            {createDefaultSection && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="branchId">Branch</Label>
                  <Select id="branchId" defaultValue={onlyBranch?.id} {...register("branchId")}>
                    <option value="">Select branch</option>
                    {branches.data?.items.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </Select>
                  {errors.branchId && (
                    <p className="text-sm text-destructive">{errors.branchId.message}</p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="defaultSectionName">Section name</Label>
                    <Input id="defaultSectionName" placeholder="A" {...register("defaultSectionName")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultSectionCapacity">Capacity (optional)</Label>
                    <Input id="defaultSectionCapacity" type="number" min={1} {...register("defaultSectionCapacity")} />
                  </div>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create class"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
