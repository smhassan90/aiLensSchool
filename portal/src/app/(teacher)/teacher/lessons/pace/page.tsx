"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubjectPaceChart } from "@/components/lessons/subject-pace-chart";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function SubjectPacePage() {
  const params = useSearchParams();
  const initialClass = params.get("class") ?? "";
  const [classKey, setClassKey] = useState(initialClass);

  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const selected = useMemo(
    () => classes.data?.find((c) => `${c.sectionId}:${c.subjectId}` === classKey),
    [classes.data, classKey],
  );

  const pace = useQuery({
    queryKey: ["subject-pace", selected?.sectionId, selected?.subjectId],
    queryFn: () =>
      lessonsService.subjectPace({
        sectionId: selected!.sectionId,
        subjectId: selected!.subjectId,
        academicYearId: selected!.academicYearId,
      }),
    enabled: Boolean(selected?.sectionId && selected?.subjectId),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Subject pace"
        description="How class days were spent across chapters in this school year."
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Class</CardTitle>
        </CardHeader>
        <CardContent className="max-w-md space-y-2">
          <Label>Subject & section</Label>
          <Select value={classKey} onChange={(e) => setClassKey(e.target.value)}>
            <option value="">Select</option>
            {classes.data?.map((cls) => (
              <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                {cls.gradeName} {cls.sectionName} — {cls.subjectName}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {!selected ? (
        <p className="text-sm text-muted-foreground">Select a class to view the chart.</p>
      ) : pace.isLoading ? (
        <PageLoader variant="panel" task="lessons" />
      ) : pace.data ? (
        <Card>
          <CardContent className="pt-6">
            <SubjectPaceChart pace={pace.data} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
