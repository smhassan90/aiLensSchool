"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { parentsService } from "@/services/parents.service";
import { Users } from "lucide-react";

export default function ParentsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["parents", debounced],
    queryFn: () => parentsService.list({ limit: 50, search: debounced || undefined }),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Parents"
        description="Parents are created with each student. Open a walk-in window when a parent visits."
      />

      <div className="mb-4 max-w-md">
        <Input
          placeholder="Search parent, phone, email or child name"
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
          <PageLoader variant="panel" />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No parents found"
            description="Parents are created when students are registered."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Children</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((parent) => (
                <TableRow key={parent.id}>
                  <TableCell className="font-medium">
                    <Link href={`/school/parents/${parent.id}`} className="hover:underline">
                      {parent.user.firstName} {parent.user.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{parent.user.username ?? parent.user.email}</TableCell>
                  <TableCell>{parent.user.phone ?? parent.phone ?? "—"}</TableCell>
                  <TableCell>
                    {(parent.students ?? [])
                      .map((link) => `${link.student.firstName} ${link.student.lastName}`)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/school/parents/${parent.id}`}>
                      <Button size="sm" variant="outline">Walk-in view</Button>
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
