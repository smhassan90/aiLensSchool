"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        description="Search any student in your supervised classes and open their 360 view."
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
        className="mb-6 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(q.trim());
        }}
      >
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Name, student ID, parent phone..."
        />
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

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
        {term.length >= 2 && search.isFetched && !search.data?.students.length ? (
          <p className="text-sm text-muted-foreground">No students found in your classes.</p>
        ) : null}
      </div>
    </div>
  );
}
