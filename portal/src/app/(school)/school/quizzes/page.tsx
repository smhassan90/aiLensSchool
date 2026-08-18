"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { QuizMixFields } from "@/components/quizzes/quiz-mix-fields";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";
import { quizzesService } from "@/services/quizzes.service";
import { homeworkService } from "@/services/homework.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { FileQuestion } from "lucide-react";

export default function SchoolQuizzesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [classKey, setClassKey] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [homeworkIds, setHomeworkIds] = useState<string[]>([]);
  const [quickGenerate, setQuickGenerate] = useState(true);
  const [mcqCount, setMcqCount] = useState(3);
  const [fillBlankCount, setFillBlankCount] = useState(1);
  const [shortAnswerCount, setShortAnswerCount] = useState(1);
  const quizzes = useQuery({ queryKey: ["quizzes"], queryFn: () => quizzesService.list({ limit: 50 }) });
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: () => academicsService.listSubjects({ limit: 100 }) });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });

  const classOptions = useMemo(
    () =>
      (sections.data?.items ?? []).flatMap((section) =>
        (section.classSubjects ?? []).map((assignment) => ({
          key: `${section.id}:${assignment.subjectId}`,
          label: `${section.grade?.name ?? ""} ${section.name} — ${assignment.subject?.name ?? "Subject"}`.trim(),
          sectionId: section.id,
          subjectId: assignment.subjectId,
          branchId: section.branchId,
          academicYearId: assignment.academicYearId,
        })),
      ),
    [sections.data?.items],
  );

  const selectedClass = classOptions.find((item) => item.key === classKey);
  const section = sections.data?.items.find((item) => item.id === (selectedClass?.sectionId ?? sectionId));
  const year = years.data?.items.find((item) => item.isCurrent) ?? years.data?.items[0];
  const activeSectionId = selectedClass?.sectionId ?? sectionId;
  const activeSubjectId = selectedClass?.subjectId ?? subjectId;
  const subjectsForSection = (subjects.data?.items ?? []).filter(
    (item) => !section?.gradeId || !item.gradeId || item.gradeId === section.gradeId,
  );

  const topics = useQuery({
    queryKey: ["homework-topics", activeSectionId, activeSubjectId],
    queryFn: () => homeworkService.list({ sectionId: activeSectionId, subjectId: activeSubjectId, limit: 100 }),
    enabled: Boolean(activeSectionId && activeSubjectId),
  });

  const generate = useMutation({
    mutationFn: () =>
      quizzesService.generate({
        academicYearId: selectedClass?.academicYearId ?? year?.id ?? "",
        sectionId: activeSectionId,
        subjectId: activeSubjectId,
        branchId: selectedClass?.branchId ?? section?.branchId ?? "",
        homeworkIds,
        quickGenerate,
        ...(quickGenerate
          ? { questionCount: 8 }
          : { mcqCount, fillBlankCount, shortAnswerCount }),
      }),
    onSuccess: (quiz) => {
      toast({ title: "Quiz generated as draft", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      setOpen(false);
      setHomeworkIds([]);
      router.push(`/school/quizzes/${quiz.id}`);
    },
    onError: (err) => toast({ title: "Generation failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  const catalogError = sections.isError || subjects.isError;
  const catalogEmpty = !sections.isLoading && !subjects.isLoading && !classOptions.length && !sections.data?.items.length;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Quizzes"
        description="Select homework topic titles. Drafts are never auto-published."
        actions={
          <Button
            onClick={() => {
              setOpen(true);
              void sections.refetch();
              void subjects.refetch();
              void years.refetch();
            }}
          >
            Generate quiz
          </Button>
        }
      />
      <div className="rounded-lg border bg-card">
        {quizzes.isLoading ? (
          <PageLoader variant="panel" />
        ) : !quizzes.data?.items.length ? (
          <EmptyState icon={<FileQuestion className="h-10 w-10" />} title="No quizzes" description="Generate from homework topic titles." />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Subject</TableHead><TableHead>Section</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {quizzes.data.items.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{q.title}</TableCell>
                  <TableCell>{q.subject?.name ?? "—"}</TableCell>
                  <TableCell>{q.section?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant={q.status === "PUBLISHED" ? "success" : "secondary"}>{q.status}</Badge></TableCell>
                  <TableCell>{formatDate(q.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/school/quizzes/${q.id}`}>
                      <Button size="sm" variant="outline">Open</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Dialog open={open} onOpenChange={(next) => !generate.isPending && setOpen(next)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onClose={() => !generate.isPending && setOpen(false)}>
          <DialogHeader><DialogTitle>Generate quiz</DialogTitle></DialogHeader>
          {generate.isPending ? (
            <AiWait kind="quiz" />
          ) : (
          <div className="space-y-3">
            {catalogError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Could not load classes. Sign out and sign in again, then retry.
              </p>
            ) : catalogEmpty ? (
              <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                No classes yet. Create a class and subject under{" "}
                <Link href="/school/academics/grades" className="font-medium text-primary underline">
                  Academics
                </Link>
                , then assign the subject to a section.
              </p>
            ) : classOptions.length ? (
              <>
                <Label>Class</Label>
                <Select
                  value={classKey}
                  onChange={(e) => {
                    setClassKey(e.target.value);
                    setHomeworkIds([]);
                  }}
                >
                  <option value="">Select class</option>
                  {classOptions.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </Select>
              </>
            ) : (
              <>
                <Label>Section</Label>
                <Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setHomeworkIds([]); }}>
                  <option value="">Select section</option>
                  {sections.data?.items.map((s) => <option key={s.id} value={s.id}>{s.grade?.name} {s.name}</option>)}
                </Select>
                <Label>Subject</Label>
                <Select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setHomeworkIds([]); }}>
                  <option value="">Select subject</option>
                  {subjectsForSection.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                {!subjectsForSection.length ? (
                  <p className="text-sm text-muted-foreground">
                    No subjects for this class. Add one under{" "}
                    <Link href="/school/academics/subjects" className="font-medium text-primary underline">Subjects</Link>.
                  </p>
                ) : null}
              </>
            )}
            <Label>Topics</Label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {!activeSectionId || !activeSubjectId ? (
                <p className="text-sm text-muted-foreground">Select a class to see homework topics.</p>
              ) : topics.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading topics…</p>
              ) : !topics.data?.items.length ? (
                <p className="text-sm text-muted-foreground">
                  No homework topics yet. Give homework with a title first from{" "}
                  <Link href="/school/homework" className="font-medium text-primary underline">Homework</Link>.
                </p>
              ) : (
                topics.data.items.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={homeworkIds.includes(item.id)}
                      onChange={(e) =>
                        setHomeworkIds((current) =>
                          e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span>
                      <span className="font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">Due {formatDate(item.dueDate)}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
            <QuizMixFields
              quickGenerate={quickGenerate}
              mcqCount={mcqCount}
              fillBlankCount={fillBlankCount}
              shortAnswerCount={shortAnswerCount}
              onQuickGenerateChange={setQuickGenerate}
              onMcqChange={setMcqCount}
              onFillBlankChange={setFillBlankCount}
              onShortAnswerChange={setShortAnswerCount}
            />
            <Button
              disabled={
                !activeSectionId ||
                !activeSubjectId ||
                homeworkIds.length === 0 ||
                (!quickGenerate && mcqCount + fillBlankCount + shortAnswerCount < 1)
              }
              onClick={() => generate.mutate()}
            >
              {quickGenerate ? "Quick generate" : "Generate"}
            </Button>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
