"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { academicsService } from "@/services/academics.service";
import { Users } from "lucide-react";

export default function SectionsPage() {
  const sections = useQuery({
    queryKey: ["sections"],
    queryFn: () => academicsService.listSections({ limit: 100 }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Sections"
        description="Sections live inside a class. Add them from the class page — a school may have only one section per class."
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
                <TableHead>Teachers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.data.items.map((section) => (
                <TableRow key={section.id}>
                  <TableCell className="font-medium">
                    {section.grade ? (
                      <Link href={`/school/academics/grades/${section.gradeId}`} className="hover:underline">
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
                  <TableCell>{section._count?.classSubjects ?? section.classSubjects?.length ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
