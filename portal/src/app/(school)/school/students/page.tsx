"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { studentsService } from "@/services/students.service";
import { GraduationCap, Plus } from "lucide-react";

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["students", debounced],
    queryFn: () => studentsService.list({ limit: 50, search: debounced || undefined }),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Students"
        description="Open a child to see progress, attendance, quizzes, report cards and fees in one window"
        actions={
          <Link href="/school/students/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add Student
            </Button>
          </Link>
        }
      />

      <div className="mb-4 max-w-md">
        <Input
          placeholder="Search name, code, parent name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={<GraduationCap className="h-10 w-10" />}
            title="No students yet"
            description="Add your first student with parent details."
            action={
              <Link href="/school/students/new">
                <Button>Add Student</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Admission #</TableHead>
                <TableHead>Class / Section</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">
                    <Link href={`/school/students/${student.id}`} className="hover:underline">
                      {student.firstName} {student.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{student.studentCode}</TableCell>
                  <TableCell>{student.admissionNumber}</TableCell>
                  <TableCell>
                    {student.grade?.name ?? "—"} / {student.section?.name ?? "—"}
                  </TableCell>
                  <TableCell>{student.branch?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={student.status === "ACTIVE" ? "success" : "secondary"}>
                      {student.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/school/students/${student.id}`}>
                      <Button size="sm" variant="outline">360 view</Button>
                    </Link>
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
