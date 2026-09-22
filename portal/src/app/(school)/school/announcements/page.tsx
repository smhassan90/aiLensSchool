"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { communicationsService } from "@/services/communications.service";
import { academicsService } from "@/services/academics.service";
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
  const [audience, setAudience] = useState<"ALL_SCHOOL" | "SECTION">("ALL_SCHOOL");
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const list = useQuery({
    queryKey: ["announcements"],
    queryFn: () => communicationsService.listAnnouncements({ limit: 50 }),
  });

  const sections = useQuery({
    queryKey: ["announcement-sections"],
    queryFn: () => academicsService.listSections({ limit: 100 }),
  });
  const sortedSections = [...(sections.data?.items ?? [])].sort((a, b) => {
    const levelDiff = (a.grade?.level ?? 0) - (b.grade?.level ?? 0);
    if (levelDiff !== 0) return levelDiff;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });

  const toggleSection = (id: string) => {
    setSectionIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const create = useMutation({
    mutationFn: () =>
      communicationsService.createAnnouncement({
        title,
        description,
        audience,
        ...(audience === "SECTION" ? { sectionIds } : {}),
        ...(publishAt ? { publishAt: new Date(publishAt).toISOString() } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      }),
    onSuccess: () => {
      toast({
        title:
          audience === "SECTION" && sectionIds.length > 1
            ? `Announcement saved as draft for ${sectionIds.length} classes`
            : "Announcement saved as draft",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setOpen(false);
      setTitle("");
      setDescription("");
      setAudience("ALL_SCHOOL");
      setSectionIds([]);
      setPublishAt("");
      setExpiresAt("");
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
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Announcements"
        description="Share notices with the school"
        actions={<Button onClick={() => setOpen(true)}>New announcement</Button>}
      />
      <div className="rounded-lg border bg-card">
        {list.isLoading ? (
          <PageLoader variant="panel" />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Megaphone className="h-10 w-10" />} title="No announcements" description="Create a notice and publish it to parents and staff." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Show from</TableHead>
                <TableHead>Expires</TableHead>
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
                  <TableCell>{row.publishAt ? formatDate(row.publishAt) : "On publish"}</TableCell>
                  <TableCell>{row.expiresAt ? formatDate(row.expiresAt) : "—"}</TableCell>
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
            <textarea
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Write the notification message"
            />
            <Label>Applicable date</Label>
            <Input
              type="date"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              When the announcement becomes visible in the app. Leave empty to show as soon as it is published.
            </p>
            <Label>Expiry date</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              When the announcement is removed from the app. Leave empty to keep it visible indefinitely.
            </p>
            <Label>Send to</Label>
            <Select
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value as typeof audience);
                setSectionIds([]);
              }}
            >
              <option value="ALL_SCHOOL">Entire school</option>
              <option value="SECTION">Specific classes / sections</option>
            </Select>
            {audience === "SECTION" ? (
              <>
                <div className="flex items-center justify-between">
                  <Label>Classes</Label>
                  {sortedSections.length ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() =>
                        setSectionIds(
                          sectionIds.length === sortedSections.length
                            ? []
                            : sortedSections.map((section) => section.id),
                        )
                      }
                    >
                      {sectionIds.length === sortedSections.length ? "Clear all" : "Select all"}
                    </button>
                  ) : null}
                </div>
                {sections.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading classes…</p>
                ) : sections.isError ? (
                  <p className="text-sm text-destructive">Couldn&apos;t load classes. Please try again.</p>
                ) : !sortedSections.length ? (
                  <p className="text-sm text-muted-foreground">No classes found.</p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                    {sortedSections.map((section) => {
                      const checked = sectionIds.includes(section.id);
                      return (
                        <label
                          key={section.id}
                          className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${
                            checked ? "bg-accent/70" : "hover:bg-muted/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input"
                            checked={checked}
                            onChange={() => toggleSection(section.id)}
                          />
                          {section.grade?.name ? `${section.grade.name} — ` : ""}
                          {section.name}
                        </label>
                      );
                    })}
                  </div>
                )}
                {sectionIds.length ? (
                  <p className="text-xs text-muted-foreground">
                    {sectionIds.length} {sectionIds.length === 1 ? "class" : "classes"} selected
                  </p>
                ) : null}
              </>
            ) : null}
            <Button
              disabled={
                create.isPending ||
                !title.trim() ||
                !description.trim() ||
                (audience === "SECTION" && sectionIds.length === 0) ||
                (publishAt && expiresAt && new Date(publishAt) > new Date(expiresAt))
              }
              onClick={() => create.mutate()}
            >
              Save draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
