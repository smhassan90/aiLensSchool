"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { TodayInClassForm } from "@/components/lessons/today-in-class-form";
import type { ClassSessionType } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export default function TodayInClassPage() {
  const params = useSearchParams();
  const classKey = params.get("class") ?? undefined;
  const sessionType = (params.get("type") as ClassSessionType | null) ?? undefined;
  const chapter = params.get("chapter") ?? undefined;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Today in class"
        description="Log what you taught. Homework is optional."
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />
      <TodayInClassForm
        initialClassKey={classKey}
        initialSessionType={sessionType}
        initialChapterId={chapter}
      />
    </div>
  );
}
