"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { libraryBooksService } from "@/services/library-books.service";
import { personFullName } from "@/lib/person-name";
import { Library } from "lucide-react";

export default function LibraryBooksPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["library-books"],
    queryFn: () => libraryBooksService.list(),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Book library"
        description="Shared textbooks. A school can use a book only while it is assigned."
        actions={
          <Link href="/super-admin/library/new">
            <Button>Add book</Button>
          </Link>
        }
      />
      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <PageLoader variant="panel" />
        ) : !data?.length ? (
          <EmptyState
            icon={<Library className="h-10 w-10" />}
            title="No books yet"
            description="Chapters already saved by teachers are imported the first time this page loads."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Publisher</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Chapters</TableHead>
                <TableHead>Schools</TableHead>
                <TableHead>Added by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((book) => (
                <TableRow key={book.id}>
                  <TableCell className="font-medium">
                    <Link href={`/super-admin/library/${book.id}`} className="hover:underline">
                      {book.title}
                    </Link>
                  </TableCell>
                  <TableCell>{book.publisher || "—"}</TableCell>
                  <TableCell>{book.classLabel || "—"}</TableCell>
                  <TableCell>{book.subjectLabel || "—"}</TableCell>
                  <TableCell>{book.chapterCount}</TableCell>
                  <TableCell>{book.schoolCount}</TableCell>
                  <TableCell>
                    {personFullName(book.createdBy.firstName, book.createdBy.lastName)}
                    {book.originSchool ? ` · ${book.originSchool.name}` : ""}
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
