"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { StudentIdPhotoUpload } from "@/components/students/student-id-photo-upload";
import { documentsService } from "@/services/documents.service";
import { studentsService } from "@/services/students.service";
import type { IdCard, Student, StudentParentLink } from "@/lib/types";
import { StudentIdCardPrint } from "@/components/students/student-id-card-print";
import { personFullName } from "@/lib/person-name";
import { IdCard as IdCardIcon, Printer, Search } from "lucide-react";

function primaryParent(student?: Student) {
  const links = student?.parents ?? [];
  const preferred =
    links.find((link) => link.isPrimary) ??
    links.find((link) => link.relationship === "FATHER") ??
    links[0];
  return preferred;
}

function parentDetails(link?: StudentParentLink) {
  const user = link?.parent?.user;
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : "—";
  const phone = link?.parent?.phone || user?.phone || "—";
  const email = user?.email || "—";
  return { name, phone, email };
}

export default function IdCardsPage() {
  const searchParams = useSearchParams();
  const urlStudentId = searchParams.get("studentId");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const linkedStudent = useQuery({
    queryKey: ["id-card-linked-student", urlStudentId],
    queryFn: () => studentsService.getById(urlStudentId!),
    enabled: Boolean(urlStudentId),
  });

  const students = useQuery({
    queryKey: ["id-card-students", search],
    queryFn: () => studentsService.list({ search, limit: 20 }),
    enabled: search.length > 0,
  });

  const matches = useMemo(() => students.data?.items ?? [], [students.data]);
  const selectedStudent = useMemo(
    () => matches.find((item) => item.id === selectedId) ?? matches[0] ?? null,
    [matches, selectedId],
  );

  const resolvedStudent = selectedStudent ?? linkedStudent.data ?? null;

  const cardQuery = useQuery({
    queryKey: ["id-card", resolvedStudent?.id],
    queryFn: () => documentsService.generateIdCards({ studentId: resolvedStudent!.id }),
    enabled: Boolean(resolvedStudent?.id),
  });

  const card: IdCard | undefined = cardQuery.data?.items[0];
  const student = card?.student ?? resolvedStudent ?? undefined;
  const parent = parentDetails(primaryParent(student));
  const enrollment = student?.enrollments?.[0];
  const classLabel = [enrollment?.grade?.name, enrollment?.section?.name].filter(Boolean).join(" · ");
  const schoolName = card?.school?.name ?? "School";

  const runSearch = () => {
    const next = query.trim();
    setSearch(next);
    setSelectedId(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="ID cards"
        description="Search a student by ID, name, or parent phone, then print their card"
        actions={
          <Button className="print:hidden" disabled={!card} onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print card
          </Button>
        }
      />

      <form
        className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto] print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div>
          <Label htmlFor="student-search">Search student</Label>
          <Input
            id="student-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Student ID, name, or parent phone"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={!query.trim() || students.isFetching}>
            <Search className="h-4 w-4" />
            {students.isFetching ? "Searching…" : "Search"}
          </Button>
        </div>
      </form>

      {search && matches.length > 1 ? (
        <div className="mb-6 rounded-lg border bg-card print:hidden">
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted ${
                (selectedStudent?.id ?? "") === item.id ? "bg-accent" : ""
              }`}
            >
              <span className="font-medium">
                {item.firstName} {item.lastName}
              </span>
              <span className="text-muted-foreground">{item.studentCode}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!search && !urlStudentId ? (
        <EmptyState
          icon={<IdCardIcon className="h-10 w-10" />}
          title="Search for a student"
          description="Enter a student ID, name, or parent phone number to open their ID card."
        />
      ) : urlStudentId && linkedStudent.isLoading ? (
        <PageLoader variant="panel" phrases={["Opening ID card", "Almost ready"]} />
      ) : urlStudentId && linkedStudent.isError ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="Student not found"
          description="This student may have been removed or you may not have access."
        />
      ) : search && students.isLoading ? (
        <PageLoader variant="panel" phrases={["Looking up the student", "Almost ready"]} />
      ) : search && students.isFetched && !matches.length ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="No student found"
          description="Try another student ID, name, or parent phone number."
        />
      ) : student ? (
        <div className="flex flex-col items-start gap-4">
          <StudentIdCardPrint
            schoolName={schoolName}
            schoolLogo={card?.school?.logo}
            schoolCity={card?.school?.city}
            studentName={personFullName(student.firstName, student.lastName)}
            photoUrl={student.photoUrl}
            cardNumber={card?.cardNumber ?? student.studentCode}
            classLabel={classLabel || undefined}
            parentName={parent.name !== "—" ? parent.name : undefined}
            parentPhone={parent.phone}
            address={student.address}
          />

          {resolvedStudent ? (
            <StudentIdPhotoUpload
              studentId={resolvedStudent.id}
              photoUrl={student?.photoUrl}
              firstName={student?.firstName}
              lastName={student?.lastName}
              showPreview={false}
              invalidateKeys={[
                ["id-card-students"],
                ["id-card", resolvedStudent.id],
                ["id-card-linked-student", resolvedStudent.id],
              ]}
              className="print:hidden"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
