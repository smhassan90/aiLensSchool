"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  academicYearId: z.string().min(1, "Required"),
  gradeId: z.string().min(1, "Required"),
  sectionId: z.string().min(1, "Required"),
  subjectId: z.string().min(1, "Required"),
  branchId: z.string().min(1, "Required"),
  date: z.string().min(1, "Required"),
  chapterName: z.string().optional(),
  topicName: z.string().optional(),
  teacherNotes: z.string().optional(),
  pageFrom: z.coerce.number().optional(),
  pageTo: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewLessonPage() {
  const router = useRouter();
  const { toast } = useToast();

  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
    },
  });

  const sectionId = watch("sectionId");
  const subjectId = watch("subjectId");

  const mutation = useMutation({
    mutationFn: (values: FormValues) => lessonsService.create(values),
    onSuccess: (lesson) => {
      toast({ title: "Lesson created", variant: "success" });
      if (lesson.status === "PENDING_REVIEW") {
        router.push(`/teacher/lessons/${lesson.id}/review`);
      } else {
        router.push("/teacher/lessons");
      }
    },
    onError: (err) => {
      toast({
        title: "Failed to create lesson",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cls = classes.data?.find(
      (c) => `${c.sectionId}:${c.subjectId}` === e.target.value,
    );
    if (!cls) return;
    setValue("sectionId", cls.sectionId);
    setValue("subjectId", cls.subjectId);
    setValue("branchId", cls.branchId);
    setValue("academicYearId", cls.academicYearId);
    if (cls.gradeId) setValue("gradeId", cls.gradeId);
  };

  const selectedClass = classes.data?.find(
    (c) => c.sectionId === sectionId && c.subjectId === subjectId,
  );

  const onSubmit = (values: FormValues) => {
    mutation.mutate({
      ...values,
      gradeId: selectedClass?.gradeId ?? values.gradeId,
    });
  };

  if (classes.isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="mx-auto h-96 max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader
        title="New Lesson"
        description="Create a manual lesson record for today&apos;s class"
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Lesson Details</CardTitle>
            <CardDescription>Select your class and enter lesson content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="classPicker">Assigned Class</Label>
              <Select id="classPicker" onChange={handleClassChange} defaultValue="">
                <option value="">Select class</option>
                {classes.data?.map((cls) => (
                  <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                    {cls.gradeName} {cls.sectionName} — {cls.subjectName}
                  </option>
                ))}
              </Select>
            </div>

            <input type="hidden" {...register("sectionId")} />
            <input type="hidden" {...register("subjectId")} />
            <input type="hidden" {...register("branchId")} />
            <input type="hidden" {...register("academicYearId")} />
            <input type="hidden" {...register("gradeId")} value={selectedClass?.gradeId ?? ""} />

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" {...register("date")} />
              {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="chapterName">Chapter</Label>
                <Input id="chapterName" {...register("chapterName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topicName">Topic</Label>
                <Input id="topicName" {...register("topicName")} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pageFrom">Page From</Label>
                <Input id="pageFrom" type="number" {...register("pageFrom")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pageTo">Page To</Label>
                <Input id="pageTo" type="number" {...register("pageTo")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacherNotes">Teacher Notes</Label>
              <Textarea id="teacherNotes" rows={4} {...register("teacherNotes")} />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/teacher/lessons">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Create Lesson"}
          </Button>
        </div>
      </form>
    </div>
  );
}
