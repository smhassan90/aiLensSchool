"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { academicPlannerService } from "@/services/academic-planner.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { friendlyApiErrorMessage } from "@/lib/display-labels";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";

const schema = z.object({
  classKey: z.string().min(1, "Select a class and subject"),
  teacherId: z.string().uuid("Select a teacher"),
  examType: z.enum(["ASSESSMENT", "MIDTERM", "FINAL_TERM"]),
  examDate: z.string().min(1, "Exam date is required"),
  startDate: z.string().optional(),
  libraryBookId: z.string().uuid("Select a library book"),
  chapterIds: z.array(z.string().uuid()).min(1, "Select at least one chapter"),
  fallbackPeriodsPerWeek: z.coerce.number().int().min(1).max(15).optional(),
  fallbackPeriodMinutes: z.coerce.number().int().min(20).max(120).optional(),
});

type FormValues = z.infer<typeof schema>;

export function PlannerCreateForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);

  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const classOptions = useMemo(() => {
    return (classes.data ?? []).map((row) => ({
      key: `${row.sectionId}:${row.subjectId}`,
      label: `${row.gradeName} ${row.sectionName} — ${row.subjectName}`,
      sectionId: row.sectionId,
      subjectId: row.subjectId,
      role: row.role,
    }));
  }, [classes.data]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      examType: "ASSESSMENT",
      examDate: "",
      startDate: "",
      libraryBookId: "",
      chapterIds: [],
      teacherId: "",
      classKey: "",
      fallbackPeriodsPerWeek: 3,
      fallbackPeriodMinutes: 40,
    },
  });

  const classKey = watch("classKey");
  const libraryBookId = watch("libraryBookId");
  const match = classOptions.find((o) => o.key === classKey);

  const options = useQuery({
    queryKey: ["planner-options", match?.sectionId, match?.subjectId],
    queryFn: () =>
      academicPlannerService.getOptions(match!.sectionId, match!.subjectId),
    enabled: Boolean(match?.sectionId && match?.subjectId),
  });

  const chapters = useQuery({
    queryKey: ["planner-book-chapters", libraryBookId],
    queryFn: () => academicPlannerService.listBookChapters(libraryBookId),
    enabled: Boolean(libraryBookId),
  });

  useEffect(() => {
    const teachers = options.data?.eligibleTeachers ?? [];
    const recommended = options.data?.recommendedPlannerTeacherId;
    const actorId = options.data?.actorTeacherId;
    const rowRole = classOptions.find((o) => o.key === classKey)?.role;

    if (recommended) {
      setValue("teacherId", recommended);
    } else if (rowRole === "CLASS_TEACHER" && actorId) {
      setValue("teacherId", actorId);
    } else if (actorId && teachers.some((t) => t.id === actorId)) {
      setValue("teacherId", actorId);
    } else if (teachers.length === 1) {
      setValue("teacherId", teachers[0].id);
    }
    const suggested = options.data?.grantedBooks.find((b) => b.suggested);
    if (suggested && !libraryBookId) {
      setValue("libraryBookId", suggested.id);
    }
    const exam = options.data?.examConfigs.find((e) => e.startDate);
    if (exam?.startDate && !watch("examDate")) {
      setValue("examDate", exam.startDate);
    }
  }, [options.data, setValue, libraryBookId, watch, classKey, classOptions]);

  const timetableNeedsFallback =
    options.data?.section.gradeHasPeriodTimetable &&
    (options.data.timetable?.source === "NONE" ||
      options.data.timetable?.periodsPerWeek == null ||
      options.data.timetable.periodsPerWeek === 0);

  useEffect(() => {
    setValue("chapterIds", selectedChapters);
  }, [selectedChapters, setValue]);

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const row = classOptions.find((o) => o.key === values.classKey);
      if (!row) throw new Error("Select a class");
      return academicPlannerService.create({
        sectionId: row.sectionId,
        subjectId: row.subjectId,
        teacherId: values.teacherId,
        examType: values.examType,
        examDate: values.examDate,
        startDate: values.startDate || undefined,
        libraryBookId: values.libraryBookId,
        chapterIds: values.chapterIds,
        settings:
          values.fallbackPeriodsPerWeek && values.fallbackPeriodMinutes
            ? {
                fallbackPeriodsPerWeek: values.fallbackPeriodsPerWeek,
                fallbackPeriodMinutes: values.fallbackPeriodMinutes,
              }
            : undefined,
      });
    },
    onSuccess: (payload) => {
      toast({ title: "Planner created", variant: "success" });
      router.push(
        `/teacher/planner/${payload.planner.id}?v=${encodeURIComponent(payload.version.id)}`,
      );
    },
    onError: (err) => {
      toast({
        title: "Could not create planner",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    },
  });

  if (classes.isLoading) return <PageLoader />;
  if (classes.isError) {
    return (
      <EmptyState
        title="Could not load your classes"
        description={friendlyApiErrorMessage(classes.error)}
        action={
          <Button type="button" variant="outline" onClick={() => classes.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <form
      className="mx-auto max-w-lg space-y-4"
      onSubmit={handleSubmit((values) => create.mutate(values))}
    >
      <div className="space-y-2">
        <Label htmlFor="classKey">Class & subject</Label>
        <Select id="classKey" {...register("classKey")}>
          <option value="">Select…</option>
          {classOptions.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </Select>
        {errors.classKey && (
          <p className="text-sm text-destructive">{errors.classKey.message}</p>
        )}
      </div>

      {options.isLoading && match && <PageLoader />}
      {options.isError && match && (
        <p className="text-sm text-destructive">{friendlyApiErrorMessage(options.error)}</p>
      )}

      {options.data && (
        <>
          {options.data.overlappingPlanners.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              Another planner already exists for this class and subject. Creating a second one may be blocked if dates overlap.
            </p>
          )}
          {options.data.timetable && (
            <p className="text-xs text-muted-foreground">
              Timetable: {options.data.timetable.source}
              {options.data.timetable.periodsPerWeek != null
                ? ` · ~${options.data.timetable.periodsPerWeek} periods/week for this subject`
                : ""}
            </p>
          )}
          {timetableNeedsFallback && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              No published timetable periods were found for this subject. The planner will assume the
              weekly periods below until a timetable is published.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="teacherId">Teacher</Label>
            <Select id="teacherId" {...register("teacherId")}>
              <option value="">Select…</option>
              {options.data.eligibleTeachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
            {errors.teacherId && (
              <p className="text-sm text-destructive">{errors.teacherId.message}</p>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="examType">Exam</Label>
        <Select id="examType" {...register("examType")}>
          <option value="ASSESSMENT">Assessment</option>
          <option value="MIDTERM">Mid term</option>
          <option value="FINAL_TERM">Final term</option>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="examDate">Exam date</Label>
          <Input id="examDate" type="date" {...register("examDate")} />
          {errors.examDate && (
            <p className="text-sm text-destructive">{errors.examDate.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="startDate">Start date (optional)</Label>
          <Input id="startDate" type="date" {...register("startDate")} />
        </div>
      </div>

      {timetableNeedsFallback && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fallbackPeriodsPerWeek">Periods per week (assumed)</Label>
            <Input
              id="fallbackPeriodsPerWeek"
              type="number"
              min={1}
              max={15}
              {...register("fallbackPeriodsPerWeek")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fallbackPeriodMinutes">Minutes per period (assumed)</Label>
            <Input
              id="fallbackPeriodMinutes"
              type="number"
              min={20}
              max={120}
              {...register("fallbackPeriodMinutes")}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="libraryBookId">Library book</Label>
        <Select id="libraryBookId" {...register("libraryBookId")} disabled={!options.data}>
          <option value="">Select…</option>
          {(options.data?.grantedBooks ?? []).map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
              {book.suggested ? " (suggested)" : ""}
            </option>
          ))}
        </Select>
        {errors.libraryBookId && (
          <p className="text-sm text-destructive">{errors.libraryBookId.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Chapters (teaching order)</Label>
        {chapters.isLoading && libraryBookId && <PageLoader />}
        {chapters.isError && (
          <p className="text-sm text-destructive">{friendlyApiErrorMessage(chapters.error)}</p>
        )}
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
          {(chapters.data ?? []).map((chapter) => {
            const checked = selectedChapters.includes(chapter.id);
            return (
              <li key={chapter.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setSelectedChapters((prev) =>
                      checked ? prev.filter((id) => id !== chapter.id) : [...prev, chapter.id],
                    );
                  }}
                />
                <span>
                  {chapter.title}
                  {!chapter.hasContent && (
                    <span className="ml-1 text-amber-700">(limited content)</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {errors.chapterIds && (
          <p className="text-sm text-destructive">{errors.chapterIds.message}</p>
        )}
      </div>

      {create.isError && create.error instanceof ApiClientError && create.error.details != null && (
        <pre className="overflow-auto rounded-md bg-muted p-2 text-xs">
          {JSON.stringify(create.error.details, null, 2)}
        </pre>
      )}

      <Button type="submit" disabled={create.isPending || !match}>
        {create.isPending ? "Creating…" : "Create planner"}
      </Button>
    </form>
  );
}
