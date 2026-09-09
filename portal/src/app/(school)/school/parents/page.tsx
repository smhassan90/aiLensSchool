"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import type { Parent } from "@/lib/types";
import { Users } from "lucide-react";

type ResetResult = {
  parentId: string;
  username: string | null;
  temporaryPassword: string;
  name: string;
};

export default function ParentsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [confirmParent, setConfirmParent] = useState<Parent | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["parents", debounced],
    queryFn: () => parentsService.list({ limit: 50, search: debounced || undefined }),
  });

  const reset = useMutation({
    mutationFn: (parent: Parent) => parentsService.resetPassword(parent.id),
    onSuccess: (result, parent) => {
      setConfirmParent(null);
      setResetResult({
        parentId: result.parentId,
        username: result.username,
        temporaryPassword: result.temporaryPassword,
        name: `${parent.user.firstName} ${parent.user.lastName}`.trim(),
      });
    },
    onError: (err) =>
      toast({
        title: "Could not reset password",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Parents"
        description="Parents are created with each student. Reset a password when a parent cannot sign in to the app."
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
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell className="font-mono text-sm">
                    {parent.user.username ?? parent.user.email}
                  </TableCell>
                  <TableCell>{parent.user.phone ?? parent.phone ?? "—"}</TableCell>
                  <TableCell>
                    {(parent.students ?? [])
                      .map((link) => `${link.student.firstName} ${link.student.lastName}`)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmParent(parent)}
                      >
                        Reset password
                      </Button>
                      <Link href={`/school/parents/${parent.id}`}>
                        <Button size="sm" variant="outline">Walk-in view</Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={Boolean(confirmParent)} onOpenChange={(open) => { if (!open) setConfirmParent(null); }}>
        <DialogContent onClose={() => setConfirmParent(null)}>
          <DialogHeader>
            <DialogTitle>Reset parent password?</DialogTitle>
            <DialogDescription>
              {confirmParent
                ? `Create a temporary password for ${confirmParent.user.firstName} ${confirmParent.user.lastName}. They must change it on next login. Existing app sessions will be signed out.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmParent(null)} disabled={reset.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!confirmParent || reset.isPending}
              onClick={() => confirmParent && reset.mutate(confirmParent)}
            >
              {reset.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetResult)} onOpenChange={(open) => { if (!open) setResetResult(null); }}>
        <DialogContent onClose={() => setResetResult(null)}>
          <DialogHeader>
            <DialogTitle>Temporary password ready</DialogTitle>
            <DialogDescription>
              Share this once with {resetResult?.name}. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {resetResult ? (
            <div className="mt-4 space-y-3 rounded-md border bg-muted/40 p-4 text-sm">
              <p>
                Username: <span className="font-mono">{resetResult.username ?? "—"}</span>
              </p>
              <p>
                Temporary password:{" "}
                <span className="font-mono font-medium">{resetResult.temporaryPassword}</span>
              </p>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setResetResult(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
