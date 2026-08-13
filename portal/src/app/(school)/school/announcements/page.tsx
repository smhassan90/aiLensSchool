"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { communicationsService } from "@/services/communications.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { Megaphone } from "lucide-react";

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const list = useQuery({
    queryKey: ["announcements"],
    queryFn: () => communicationsService.listAnnouncements({ limit: 50 }),
  });

  const create = useMutation({
    mutationFn: () => communicationsService.createAnnouncement({ title, description, audience: "ALL_SCHOOL" }),
    onSuccess: () => {
      toast({ title: "Announcement saved as draft", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setOpen(false);
      setTitle("");
      setDescription("");
    },
    onError: (err) => toast({ title: "Save failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  const publish = useMutation({
    mutationFn: (id: string) => communicationsService.publishAnnouncement(id),
    onSuccess: () => {
      toast({ title: "Published", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (err) => toast({ title: "Publish failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Announcements"
        description="Share notices with the school"
        actions={<Button onClick={() => setOpen(true)}>New announcement</Button>}
      />
      <div className="rounded-lg border bg-card">
        {!list.data?.items.length ? (
          <EmptyState icon={<Megaphone className="h-10 w-10" />} title="No announcements" description="Create a notice and publish it to parents and staff." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.title}</p>
                    <p className="text-sm text-muted-foreground">{row.description}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "PUBLISHED" ? "success" : "secondary"}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    {row.status !== "PUBLISHED" && (
                      <Button size="sm" variant="outline" onClick={() => publish.mutate(row.id)}>Publish</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            <Label>Message</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button disabled={create.isPending || !title || !description} onClick={() => create.mutate()}>Save draft</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
