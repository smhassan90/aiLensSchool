"use client";

import { PageLoader } from "@/components/layout/page-loader";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { teacherDisplayNameFromUser } from "@/lib/person-name";
import { Users } from "lucide-react";

export default function SectionsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const sections = useQuery({
    queryKey: ["sections"],
    queryFn: () => academicsService.listSections({ limit: 200 }),
  });
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => teachersService.list({ limit: 100 }),
  });

  const setClassTeacher = useMutation({
    mutationFn: ({
      sectionId,
      classTeacherId,
    }: {
      sectionId: string;
      classTeacherId: string | null;
    }) => academicsService.setClassTeacher(sectionId, classTeacherId),
    onSuccess: () => {
      toast({ title: "Class teacher saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["sections"] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
    },
    onError: (err) => {
      toast({
        title: "Could not assign class teacher",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Sections"
        description="Assign a class teacher for each section. Subject teachers are managed on the class page."
        actions={
          <Link href="/school/academics/grades">
            <Button>Manage classes</Button>
          </Link>
        }
      />

      <div className="rounded-lg border bg-card">
        {sections.isLoading ? (
          <PageLoader variant="panel" />
        ) : !sections.data?.items.length ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No sections yet"
            description="Open a class and add section A, or create the class with a single default section."
            action={
              <Link href="/school/academics/grades">
                <Button>Go to classes</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Subject teachers</TableHead>
                <TableHead>Class teacher</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.data.items.map((section) => (
                <TableRow key={section.id}>
                  <TableCell className="font-medium">
                    {section.grade ? (
                      <Link
                        href={`/school/academics/grades/${section.gradeId}`}
                        className="hover:underline"
                      >
                        {section.grade.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{section.name}</Badge>
                  </TableCell>
                  <TableCell>{section.branch?.name ?? "—"}</TableCell>
                  <TableCell>{section._count?.enrollments ?? 0}</TableCell>
                  <TableCell>
                    {(() => {
                      const names = [
                        ...new Set(
                          (section.classSubjects ?? [])
                            .map((item) => item.subject?.name)
                            .filter((name): name is string => Boolean(name)),
                        ),
                      ];
                      if (!names.length) {
                        return section._count?.classSubjects ?? 0;
                      }
                      return (
                        <div>
                          <span className="font-medium">{names.length}</span>
                          <p className="max-w-[240px] text-xs text-muted-foreground">{names.join(" · ")}</p>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Label className="sr-only" htmlFor={`class-teacher-${section.id}`}>
                      Class teacher for {section.grade?.name} {section.name}
                    </Label>
                    <Select
                      id={`class-teacher-${section.id}`}
                      className="max-w-[220px]"
                      value={section.classTeacherId ?? ""}
                      disabled={setClassTeacher.isPending}
                      onChange={(e) =>
                        setClassTeacher.mutate({
                          sectionId: section.id,
                          classTeacherId: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Not assigned</option>
                      {(teachers.data?.items ?? []).map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacherDisplayNameFromUser(teacher.user, teacher.gender)}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
