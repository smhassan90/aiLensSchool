"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Student360View, type Student360Data } from "@/components/students/student-360-view";
import { insightsService } from "@/services/insights.service";
import { personFullName } from "@/lib/person-name";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

type ParentOverview = {
  parent: { firstName: string; lastName: string; email: string; phone?: string };
  children: Student360Data[];
};

export default function ParentWalkInPage() {
  const params = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["parent-overview", params.id],
    queryFn: () => insightsService.parent(params.id) as Promise<ParentOverview>,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const children = query.data?.children ?? [];
  const activeChild = useMemo(() => {
    if (!children.length) return null;
    const fallback = children[0].student.id ?? children[0].student.studentCode;
    const id = selectedId ?? fallback;
    return children.find((child) => (child.student.id ?? child.student.studentCode) === id) ?? children[0];
  }, [children, selectedId]);

  if (query.isLoading) {
    return <PageLoader variant="page" />;
  }
  if (!query.data) return <div className="p-4 sm:p-6 lg:p-8">Parent not found.</div>;

  const { parent } = query.data;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Parent walk-in</p>
          <h1 className="mt-1 font-display text-lg text-slate-900">
            {parent.firstName} {parent.lastName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {parent.phone ?? parent.email} · {children.length} child{children.length === 1 ? "" : "ren"}
          </p>
        </div>
        <Link href="/school/parents">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">No children linked.</p>
      ) : (
        <div className="space-y-6">
          {children.length > 1 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {children.map((child) => {
                const id = child.student.id ?? child.student.studentCode;
                const active = (activeChild?.student.id ?? activeChild?.student.studentCode) === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedId(id)}
                    className={cn(
                      "rounded-2xl border px-4 py-3.5 text-left transition-all",
                      active
                        ? "border-teal-500 bg-teal-50 shadow-sm ring-2 ring-teal-500/20"
                        : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md",
                    )}
                  >
                    <p className="font-medium text-slate-900">
                      {personFullName(child.student.firstName, child.student.lastName)}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {child.student.grade?.name ?? "Unassigned"} {child.student.section?.name ?? ""}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}

          {activeChild ? (
            <Student360View
              data={activeChild}
              studentId={activeChild.student.id ?? activeChild.student.studentCode}
              showFullProfileLink
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
