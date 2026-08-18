"use client";

import { PageLoader } from "@/components/layout/page-loader";

import { useState } from "react";
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
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { Calendar, Plus } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "Required"),
  startDate: z.string().min(1, "Required"),
  endDate: z.string().min(1, "Required"),
  isCurrent: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function AcademicYearsPage() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicsService.listYears({ limit: 50 }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isCurrent: true },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => academicsService.createYear(values),
    onSuccess: () => {
      toast({ title: "Academic year created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      reset({ isCurrent: true, name: "", startDate: "", endDate: "" });
      setOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Could not create year",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Academic Years"
        description="Set the current year before assigning teachers and students to classes"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add year
          </Button>
        }
      />

      <div className="rounded-lg border bg-card">
        {years.isLoading ? (
          <PageLoader variant="panel" />
        ) : !years.data?.items.length ? (
          <EmptyState
            icon={<Calendar className="h-10 w-10" />}
            title="No academic years"
            description="Create the current academic year first."
            action={<Button onClick={() => setOpen(true)}>Add year</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.data.items.map((year) => (
                <TableRow key={year.id}>
                  <TableCell className="font-medium">{year.name}</TableCell>
                  <TableCell>{year.startDate.slice(0, 10)}</TableCell>
                  <TableCell>{year.endDate.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Badge variant={year.isCurrent ? "success" : "secondary"}>
                      {year.isCurrent ? "Current" : "Past"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add academic year</DialogTitle>
            <DialogDescription>Used when assigning teachers and enrolling students.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit((v) => mutation.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="2025-2026" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" type="date" {...register("startDate")} />
                {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" type="date" {...register("endDate")} />
                {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("isCurrent")} />
              Set as current year
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create year"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
