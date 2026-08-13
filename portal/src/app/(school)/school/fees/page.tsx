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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { feesService } from "@/services/fees.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { Wallet } from "lucide-react";

export default function FeesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [payId, setPayId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [feeName, setFeeName] = useState("Monthly Tuition");
  const [feeAmount, setFeeAmount] = useState("5000");
  const [period, setPeriod] = useState("August 2026");
  const [structureId, setStructureId] = useState("");
  const [yearId, setYearId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));

  const fees = useQuery({
    queryKey: ["fees", search],
    queryFn: () => feesService.list({ search: search || undefined, limit: 100 }),
  });
  const structures = useQuery({ queryKey: ["fee-structures"], queryFn: () => feesService.listStructures() });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });

  const createStructure = useMutation({
    mutationFn: () => feesService.createStructure({ name: feeName, amount: Number(feeAmount), frequency: "MONTHLY" }),
    onSuccess: () => {
      toast({ title: "Fee type created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
      setStructureOpen(false);
    },
    onError: (err) => toast({ title: "Could not create fee type", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  const assign = useMutation({
    mutationFn: () =>
      feesService.assign({
        feeStructureId: structureId,
        academicYearId: yearId,
        periodLabel: period,
        dueDate,
        sectionId: sectionId || undefined,
      }),
    onSuccess: (res) => {
      toast({ title: `Assigned to ${res.assigned} students`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["fees"] });
      setAssignOpen(false);
    },
    onError: (err) => toast({ title: "Assign failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  const pay = useMutation({
    mutationFn: () => feesService.pay({ studentFeeId: payId!, amount: Number(amount), method: "CASH" }),
    onSuccess: () => {
      toast({ title: "Payment recorded", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["fees"] });
      setPayId(null);
      setAmount("");
    },
    onError: (err) => toast({ title: "Payment failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Fees"
        description="Assign tuition and collect payments"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStructureOpen(true)}>New fee type</Button>
            <Button onClick={() => setAssignOpen(true)}>Assign fees</Button>
          </div>
        }
      />
      <div className="mb-4 max-w-md">
        <Input placeholder="Search student name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="rounded-lg border bg-card">
        {!fees.data?.items.length ? (
          <EmptyState icon={<Wallet className="h-10 w-10" />} title="No fee records" description="Create a fee type and assign it to a class." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.student ? `${row.student.firstName} ${row.student.lastName}` : "—"}</TableCell>
                  <TableCell>{row.periodLabel}</TableCell>
                  <TableCell>{row.amount}</TableCell>
                  <TableCell>{row.paidAmount}</TableCell>
                  <TableCell><Badge variant={row.status === "PAID" ? "success" : row.status === "DUE" ? "destructive" : "warning"}>{row.status}</Badge></TableCell>
                  <TableCell>
                    {row.status !== "PAID" && (
                      <Button size="sm" variant="outline" onClick={() => { setPayId(row.id); setAmount(String(row.balance ?? row.amount - row.paidAmount)); }}>Pay</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={structureOpen} onOpenChange={setStructureOpen}>
        <DialogContent onClose={() => setStructureOpen(false)}>
          <DialogHeader><DialogTitle>New fee type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Name</Label>
            <Input value={feeName} onChange={(e) => setFeeName(e.target.value)} />
            <Label>Amount</Label>
            <Input type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
            <Button disabled={createStructure.isPending || !feeName || !feeAmount} onClick={() => createStructure.mutate()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent onClose={() => setAssignOpen(false)}>
          <DialogHeader><DialogTitle>Assign fees</DialogTitle><DialogDescription>Bill a whole section for a period.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Label>Fee type</Label>
            <Select value={structureId} onChange={(e) => setStructureId(e.target.value)}>
              <option value="">Select</option>
              {structures.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.amount})</option>)}
            </Select>
            <Label>Year</Label>
            <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
              <option value="">Select</option>
              {years.data?.items.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
            <Label>Section</Label>
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Select</option>
              {sections.data?.items.map((s) => <option key={s.id} value={s.id}>{s.grade?.name} {s.name}</option>)}
            </Select>
            <Label>Period</Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Button onClick={() => assign.mutate()} disabled={assign.isPending || !structureId || !yearId || !sectionId}>Assign</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(payId)} onOpenChange={(open) => !open && setPayId(null)}>
        <DialogContent onClose={() => setPayId(null)}>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button onClick={() => pay.mutate()} disabled={pay.isPending}>Save payment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
