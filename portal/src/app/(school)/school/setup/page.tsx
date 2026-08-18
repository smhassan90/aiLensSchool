"use client";

import { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { setupService } from "@/services/school-ops.service";
import { useToast } from "@/providers/toast-provider";

export default function SetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const run = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const gradeCount = Number(data.get("gradeCount") || 5);
      const grades = Array.from({ length: gradeCount }, (_, i) => ({
        name: `Class ${i + 1}`,
        level: i + 1,
        section: "A",
      }));
      return setupService.run({
        yearName: String(data.get("yearName")),
        startDate: String(data.get("startDate")),
        endDate: String(data.get("endDate")),
        grades,
        subjects: [
          { name: "English", code: "ENG" },
          { name: "Maths", code: "MATH" },
          { name: "Science", code: "SCI" },
          { name: "Urdu", code: "URD" },
        ],
        feeName: "Monthly fee",
        feeAmount: Number(data.get("feeAmount") || 0),
        examPattern: String(data.get("examPattern")) as "MID_FINAL" | "THREE_TERMS",
        minQuizzes: Number(data.get("minQuizzes") || 4),
      });
    },
    onSuccess: () => {
      toast({ title: "School is ready", description: "You can add teachers and students now.", variant: "success" });
      router.push("/school/dashboard");
    },
    onError: (err: Error) => toast({ title: "Setup failed", description: err.message, variant: "error" }),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run.mutate(e.currentTarget);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Start the school" description="Four answers. We create classes, subjects, exam pattern and quiz targets for you." />
      <Card className="max-w-xl">
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div><Label>This year name</Label><Input name="yearName" defaultValue="2026-27" required /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Starts</Label><Input name="startDate" type="date" required /></div>
              <div><Label>Ends</Label><Input name="endDate" type="date" required /></div>
            </div>
            <div><Label>How many classes? (1 to 10)</Label><Input name="gradeCount" type="number" min={1} max={12} defaultValue={5} /></div>
            <div>
              <Label>Exam pattern</Label>
              <select name="examPattern" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="MID_FINAL">Mid term + Final</option>
                <option value="THREE_TERMS">First, second, third term</option>
              </select>
            </div>
            <div><Label>Monthly fee (optional)</Label><Input name="feeAmount" type="number" min={0} placeholder="5000" /></div>
            <div><Label>Minimum quizzes per subject</Label><Input name="minQuizzes" type="number" min={1} defaultValue={4} /></div>
            <Button type="submit" disabled={run.isPending}>{run.isPending ? "Setting up…" : "Create my school"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
