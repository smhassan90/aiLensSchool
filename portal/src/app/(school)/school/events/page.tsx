"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { communicationsService } from "@/services/communications.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { Calendar } from "lucide-react";

const EVENT_TYPES = ["PARENT_MEETING", "EXAM", "HOLIDAY", "SPORTS_DAY", "SCHOOL_TRIP", "ANNUAL_FUNCTION", "OTHER"];

export default function EventsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("PARENT_MEETING");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const list = useQuery({
    queryKey: ["events"],
    queryFn: () => communicationsService.listEvents({ limit: 50 }),
  });

  const create = useMutation({
    mutationFn: () =>
      communicationsService.createEvent({
        title,
        type,
        startDate,
        endDate,
        location: location || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Event created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setOpen(false);
      setTitle("");
    },
    onError: (err) => toast({ title: "Save failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-8">
      <PageHeader title="Events" description="School calendar" actions={<Button onClick={() => setOpen(true)}>New event</Button>} />
      <div className="rounded-lg border bg-card">
        {!list.data?.items.length ? (
          <EmptyState icon={<Calendar className="h-10 w-10" />} title="No events" description="Add parent meetings, exams and holidays." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell><Badge>{row.type}</Badge></TableCell>
                  <TableCell>{formatDate(row.startDate)} – {formatDate(row.endDate)}</TableCell>
                  <TableCell>{row.location ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader><DialogTitle>New event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {EVENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Label>Start</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Label>End</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            <Button disabled={create.isPending || !title} onClick={() => create.mutate()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
