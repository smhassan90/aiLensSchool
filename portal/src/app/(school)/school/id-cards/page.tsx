"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { documentsService } from "@/services/documents.service";
import { studentsService } from "@/services/students.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError, assetUrl } from "@/lib/api-client";
import type { IdCard, Student, StudentParentLink } from "@/lib/types";
import { Camera, IdCard as IdCardIcon, Printer, Search } from "lucide-react";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const cardQuery = useQuery({
    queryKey: ["id-card", selectedStudent?.id],
    queryFn: () => documentsService.generateIdCards({ studentId: selectedStudent!.id }),
    enabled: Boolean(selectedStudent?.id),
  });

  const card: IdCard | undefined = cardQuery.data?.items[0];
  const student = card?.student ?? selectedStudent ?? undefined;
  const parent = parentDetails(primaryParent(student));
  const photo = assetUrl(student?.photoUrl);
  const enrollment = student?.enrollments?.[0];

  const uploadPhoto = useMutation({
    mutationFn: (file: File) => studentsService.uploadPhoto(selectedStudent!.id, file),
    onSuccess: () => {
      toast({ title: "Photo uploaded", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["id-card-students"] });
      queryClient.invalidateQueries({ queryKey: ["id-card", selectedStudent?.id] });
    },
    onError: (err) =>
      toast({
        title: "Upload failed",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

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

      {!search ? (
        <EmptyState
          icon={<IdCardIcon className="h-10 w-10" />}
          title="Search for a student"
          description="Enter a student ID, name, or parent phone number to open their ID card."
        />
      ) : students.isLoading ? (
        <PageLoader variant="panel" phrases={["Looking up the student", "Almost ready"]} />
      ) : students.isFetched && !matches.length ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="No student found"
          description="Try another student ID, name, or parent phone number."
        />
      ) : student ? (
        <div className="flex flex-col items-start gap-4">
          <div
            id="printable-id-card"
            className="w-[86mm] overflow-hidden rounded-xl border-2 border-teal-700 bg-white text-slate-900 shadow-md"
          >
            <div className="bg-teal-700 px-3 py-2 text-white">
              <p className="text-[10px] uppercase tracking-[0.16em]">{card?.school?.name ?? "HawkNexa"}</p>
              <p className="text-xs font-medium">Student Identity Card</p>
            </div>
            <div className="flex gap-3 p-3">
              <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-400">No photo</div>
                )}
              </div>
              <div className="min-w-0 text-[11px] leading-4">
                <p className="font-display text-sm font-semibold leading-5">
                  {student.firstName} {student.lastName}
                </p>
                <p className="text-slate-500">{card?.cardNumber ?? student.studentCode}</p>
                <p className="mt-1">{enrollment?.grade?.name} {enrollment?.section?.name}</p>
                <p><span className="text-slate-500">Parent:</span> {parent.name}</p>
                <p><span className="text-slate-500">Phone:</span> {parent.phone}</p>
                <p className="truncate"><span className="text-slate-500">Email:</span> {parent.email}</p>
              </div>
            </div>
            <div className="border-t border-teal-700/20 bg-slate-50 px-3 py-1.5 text-[10px] leading-3.5 text-slate-700">
              <span className="font-semibold uppercase tracking-wide text-teal-800">Address </span>
              <span className="break-words">{student.address?.trim() || "—"}</span>
            </div>
          </div>

          <div className="flex gap-2 print:hidden">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadPhoto.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!selectedStudent || uploadPhoto.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              {uploadPhoto.isPending ? "Uploading…" : "Upload photo"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
