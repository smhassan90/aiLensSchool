"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { headTeachersService } from "@/services/head-teachers.service";

export default function HeadTeacherStudentsPage() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const search = useQuery({
    queryKey: ["head-teacher-student-search", term],
    queryFn: () => headTeachersService.searchStudents(term),
    enabled: term.length >= 2,
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Students"
        description="Search any student in your supervised classes and open their overview."
        actions={
          <Link href="/teacher/head">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <form
        className="mb-2 flex max-w-xl flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(q.trim());
        }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="student-search" className="sr-only">Search students</Label>
          <Input
            id="student-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Name, student ID, parent phone..."
          />
        </div>
        <Button type="submit" disabled={q.trim().length < 2}>
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>
      <p className="mb-6 text-xs text-muted-foreground">
        Enter at least 2 characters, then press Search. Results are limited to your supervised classes.
      </p>

      {search.isFetching && term.length >= 2 ? (
        <p className="mb-4 text-sm text-muted-foreground">Searching…</p>
      ) : null}

      <div className="space-y-2">
        {(search.data?.students ?? []).map((student) => (
          <Link
            key={student.id}
            href={`/teacher/head/students/${student.id}`}
            className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
          >
            <p className="font-medium">{student.name}</p>
            <p className="text-sm text-muted-foreground">
              {student.studentCode}
              {student.className ? ` · ${student.className} ${student.sectionName ?? ""}` : ""}
            </p>
          </Link>
        ))}
        {term.length >= 2 && search.isFetched && !search.isFetching && !search.data?.students.length ? (
          <p className="text-sm text-muted-foreground">No students found in your classes.</p>
        ) : null}
      </div>
    </div>
  );
}
