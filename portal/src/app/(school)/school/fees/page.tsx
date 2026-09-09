"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { FeeReceiptSheet, receiptWhatsAppText } from "@/components/fees/fee-receipt";
import { feesService } from "@/services/fees.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatPkr, whatsappUrl } from "@/lib/money";
import type { FeeReceipt } from "@/lib/types";
import { Search, Wallet, MessageCircle, Printer } from "lucide-react";

function round2(value: number) {
  return Number(value.toFixed(2));
}

export default function FeesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [studentId, setStudentId] = useState(searchParams.get("studentId") ?? "");
  const [selectedFeeId, setSelectedFeeId] = useState<string>("");
  const [collected, setCollected] = useState("");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<FeeReceipt | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [feeName, setFeeName] = useState("Monthly Tuition");
  const [feeAmount, setFeeAmount] = useState("5000");
  const [feeGradeId, setFeeGradeId] = useState("");
  const [feeFrequency, setFeeFrequency] = useState("MONTHLY");
  const [period, setPeriod] = useState("");
  const [yearId, setYearId] = useState("");
  const [feeBracket, setFeeBracket] = useState("");
  const [newBracket, setNewBracket] = useState("");
  const [showNewBracket, setShowNewBracket] = useState(false);
  const [targetKey, setTargetKey] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [localBrackets, setLocalBrackets] = useState<number[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (searchParams.get("focus") === "types") setStructureOpen(true);
    const fromUrl = searchParams.get("studentId");
    if (fromUrl) setStudentId(fromUrl);
  }, [searchParams]);

  const lookup = useQuery({
    queryKey: ["fee-lookup", debounced],
    queryFn: () => feesService.lookup(debounced),
    enabled: debounced.length >= 2 && !studentId,
  });
  const account = useQuery({
    queryKey: ["fee-account", studentId],
    queryFn: () => feesService.getAccount(studentId),
    enabled: Boolean(studentId),
  });
  const structures = useQuery({ queryKey: ["fee-structures"], queryFn: () => feesService.listStructures() });
  const brackets = useQuery({ queryKey: ["fee-brackets"], queryFn: () => feesService.listBrackets() });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const grades = useQuery({ queryKey: ["grades"], queryFn: () => academicsService.listGrades({ limit: 100 }) });
  const stages = useQuery({ queryKey: ["school-stages"], queryFn: () => academicsService.listStages() });

  const bracketAmounts = useMemo(() => {
    const set = new Set<number>([...(brackets.data?.amounts ?? []), ...localBrackets]);
    return Array.from(set).sort((a, b) => a - b);
  }, [brackets.data, localBrackets]);

  useEffect(() => {
    const current = years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];
    if (current && !yearId) setYearId(current.id);
  }, [years.data, yearId]);

  useEffect(() => {
    if (!period) {
      setPeriod(new Date().toLocaleString("en-US", { month: "long", year: "numeric" }));
    }
  }, [period]);

  useEffect(() => {
    if (!feeBracket && bracketAmounts.length) {
      setFeeBracket(String(bracketAmounts[0]));
    }
  }, [bracketAmounts, feeBracket]);

  const selectedTargetLabel = useMemo(() => {
    if (!targetKey) return "";
    if (targetKey.startsWith("stage:")) {
      const id = targetKey.slice(6);
      const stage = (stages.data ?? []).find((s) => s.id === id);
      if (!stage) return "";
      const names = stage.grades?.map((g) => g.name).join(", ") || "no classes yet";
      return `${stage.name} → ${names}`;
    }
    if (targetKey.startsWith("grade:")) {
      const id = targetKey.slice(6);
      const grade = grades.data?.items.find((g) => g.id === id);
      return grade?.name ?? "";
    }
    return "";
  }, [targetKey, stages.data, grades.data]);

  const dueRows = account.data?.fees.filter((fee) => fee.balance > 0) ?? [];
  const selectedFee = dueRows.find((fee) => fee.id === selectedFeeId);
  const billedDue = selectedFee?.balance ?? account.data?.suggested.amount ?? 0;
  const collectedNum = Number(collected || 0);
  const discountNum = Number(discount || 0);
  const remaining = round2(Math.max(0, billedDue - collectedNum - discountNum));

  useEffect(() => {
    if (!account.data) return;
    const firstDue = account.data.fees.find((fee) => fee.balance > 0);
    setSelectedFeeId(firstDue?.id ?? "");
    setCollected(String(firstDue?.balance ?? account.data.suggested.amount ?? 0));
    setDiscount("0");
    setNotes("");
  }, [account.data]);

  const collect = useMutation({
    mutationFn: () => {
      if (!studentId) throw new Error("Select a student");
      return feesService.collect({
        studentId,
        studentFeeId: selectedFeeId || undefined,
        feeStructureId: selectedFeeId ? undefined : account.data?.suggested.feeStructureId || undefined,
        periodLabel: selectedFeeId ? undefined : account.data?.suggested.periodLabel,
        billedAmount: selectedFeeId ? undefined : account.data?.suggested.billedAmount,
        collectedAmount: collectedNum,
        discountAmount: discountNum,
        method: "CASH",
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      toast({ title: `Receipt ${res.receiptNumber}`, variant: "success" });
      setReceipt(res);
      queryClient.invalidateQueries({ queryKey: ["fee-account", studentId] });
      queryClient.invalidateQueries({ queryKey: ["fees"] });
    },
    onError: (err) =>
      toast({
        title: "Could not collect fee",
        description: err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "",
        variant: "error",
      }),
  });

  const createStructure = useMutation({
    mutationFn: () =>
      feesService.createStructure({
        name: feeName,
        amount: Number(feeAmount),
        frequency: feeFrequency,
        gradeId: feeGradeId || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Fee type created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
      setStructureOpen(false);
    },
    onError: (err) =>
      toast({ title: "Could not create fee type", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  const assign = useMutation({
    mutationFn: () => {
      const amount = Number(feeBracket);
      if (!amount || amount <= 0) throw new Error("Select a fee amount");
      if (!yearId) throw new Error("Select a year");
      if (!targetKey) throw new Error("Select a school section or class");
      const payload: {
        academicYearId: string;
        periodLabel: string;
        dueDate: string;
        amount: number;
        stageId?: string;
        gradeId?: string;
      } = {
        academicYearId: yearId,
        periodLabel: period,
        dueDate,
        amount,
      };
      if (targetKey.startsWith("stage:")) payload.stageId = targetKey.slice(6);
      if (targetKey.startsWith("grade:")) payload.gradeId = targetKey.slice(6);
      return feesService.assign(payload);
    },
    onSuccess: (res) => {
      const classList = res.classes?.length ? ` for ${res.classes.join(", ")}` : "";
      toast({
        title: `Set ${formatPkr(res.amount ?? Number(feeBracket))}${classList}`,
        description: res.assigned
          ? `Billed ${res.assigned} students`
          : `Updated ${res.classesUpdated ?? 0} classes (no students enrolled yet)`,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["fee-account"] });
      queryClient.invalidateQueries({ queryKey: ["fee-brackets"] });
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["school-stages"] });
      setAssignOpen(false);
    },
    onError: (err) =>
      toast({
        title: "Could not bill students",
        description: err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "",
        variant: "error",
      }),
  });

  const canAssign = Boolean(yearId && period && feeBracket && targetKey && Number(feeBracket) > 0);

  const addBracket = () => {
    const value = Number(newBracket);
    if (!value || value <= 0) {
      toast({ title: "Enter a valid amount", variant: "error" });
      return;
    }
    setLocalBrackets((current) => (current.includes(value) ? current : [...current, value]));
    setFeeBracket(String(value));
    setNewBracket("");
    setShowNewBracket(false);
  };

  const whatsappLink = useMemo(() => {
    if (!receipt) return "";
    const phone = receipt.parents.find((parent) => parent.phone)?.phone ?? "";
    return phone ? whatsappUrl(phone, receiptWhatsAppText(receipt)) : "";
  }, [receipt]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="Collect fees"
          description="Class tuition is set on each class. Search a child, take cash, then print or WhatsApp the receipt."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStructureOpen(true)}>Fee types</Button>
              <Button variant="outline" onClick={() => setAssignOpen(true)}>Bill students</Button>
            </div>
          }
        />

        {!studentId ? (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Who is paying?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Student ID, parent name or parent phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {debounced.length >= 2 && lookup.isLoading ? <PageLoader variant="panel" /> : null}
              {lookup.data && !lookup.data.items.length ? (
                <EmptyState icon={<Wallet className="h-10 w-10" />} title="No student found" description="Try the student ID, a parent’s name, or their phone number." />
              ) : null}
              <div className="divide-y rounded-md border">
                {(lookup.data?.items ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-muted"
                    onClick={() => setStudentId(item.id)}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {item.studentCode} · {item.className ?? "—"} {item.sectionName ?? ""}
                      {item.dueTotal > 0 ? ` · due ${formatPkr(item.dueTotal)}` : ""}
                    </span>
                    {item.parents[0] ? (
                      <span className="text-sm text-muted-foreground">
                        {item.parents[0].name}
                        {item.parents[0].phone ? ` · ${item.parents[0].phone}` : ""}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : account.isLoading ? (
          <PageLoader variant="page" />
        ) : !account.data ? (
          <EmptyState icon={<Wallet className="h-10 w-10" />} title="Student not found" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {account.data.student.firstName} {account.data.student.lastName}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {account.data.student.studentCode} · {account.data.className} {account.data.sectionName}
                  </p>
                  {account.data.parents.map((parent) => (
                    <p key={`${parent.name}-${parent.phone}`} className="text-sm text-muted-foreground">
                      {parent.relationship}: {parent.name} {parent.phone ? `· ${parent.phone}` : ""}
                    </p>
                  ))}
                </div>
                <Button variant="outline" onClick={() => { setStudentId(""); setReceipt(null); setSearch(""); }}>
                  Another student
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  Default monthly tuition: <span className="font-medium">{formatPkr(account.data.tuitionDefault)}</span>
                </p>
                {dueRows.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Bill to collect</Label>
                    {dueRows.map((fee) => (
                      <label key={fee.id} className="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="fee"
                            checked={selectedFeeId === fee.id}
                            onChange={() => {
                              setSelectedFeeId(fee.id);
                              setCollected(String(fee.balance));
                              setDiscount("0");
                            }}
                          />
                          {fee.name} · {fee.periodLabel}
                        </span>
                        <span>
                          {formatPkr(fee.balance)} <Badge variant={fee.status === "PARTIAL" ? "warning" : "destructive"}>{fee.status}</Badge>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border px-3 py-2 text-sm">
                    No open bill yet. Collecting will create {account.data.suggested.label} for {account.data.suggested.periodLabel} at {formatPkr(account.data.suggested.billedAmount)}.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Amount collected</Label>
                    <Input type="number" min={0} value={collected} onChange={(e) => setCollected(e.target.value)} />
                  </div>
                  <div>
                    <Label>Discount</Label>
                    <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDiscount(String(round2(Math.max(0, billedDue - collectedNum))));
                    }}
                  >
                    Give rest as discount
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDiscount("0")}
                  >
                    Keep rest as balance
                  </Button>
                </div>
                <p className="text-sm">
                  Due {formatPkr(billedDue)} · Collected {formatPkr(collectedNum)} · Discount {formatPkr(discountNum)} ·{" "}
                  <span className="font-medium">Balance {formatPkr(remaining)}</span>
                </p>
                <div>
                  <Label>Note (optional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cash / bank / late fee waived" />
                </div>
                <Button
                  disabled={collect.isPending || (billedDue <= 0 && collectedNum <= 0)}
                  onClick={() => collect.mutate()}
                >
                  {collect.isPending ? "Saving…" : "Collect and make receipt"}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {receipt ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Receipt</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <FeeReceiptSheet receipt={receipt} />
                    <div className="flex flex-wrap gap-2 print:hidden">
                      <Button onClick={() => window.print()}>
                        <Printer className="h-4 w-4" />
                        Print
                      </Button>
                      {whatsappLink ? (
                        <Button variant="outline" asChild={false} onClick={() => window.open(whatsappLink, "_blank")}>
                          <MessageCircle className="h-4 w-4" />
                          Send on WhatsApp
                        </Button>
                      ) : (
                        <p className="text-sm text-muted-foreground">No parent phone on file for WhatsApp.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    After you collect, the receipt appears here to print or send on WhatsApp.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {receipt ? (
        <div className="hidden print:block">
          <FeeReceiptSheet receipt={receipt} />
        </div>
      ) : null}

      <Dialog open={structureOpen} onOpenChange={setStructureOpen}>
        <DialogContent onClose={() => setStructureOpen(false)}>
          <DialogHeader>
            <DialogTitle>New fee type</DialogTitle>
            <DialogDescription>
              Leave class blank for a school-wide charge. Pick a class for a fee that only that class pays.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Name</Label>
            <Input value={feeName} onChange={(e) => setFeeName(e.target.value)} />
            <Label>Amount</Label>
            <Input type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
            <Label>Class (optional)</Label>
            <Select value={feeGradeId} onChange={(e) => setFeeGradeId(e.target.value)}>
              <option value="">Whole school</option>
              {(grades.data?.items ?? []).map((grade) => (
                <option key={grade.id} value={grade.id}>{grade.name}</option>
              ))}
            </Select>
            <Label>When</Label>
            <Select value={feeFrequency} onChange={(e) => setFeeFrequency(e.target.value)}>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUAL">Annual</option>
              <option value="ONE_TIME">One time</option>
            </Select>
            <Button disabled={createStructure.isPending || !feeName || !feeAmount} onClick={() => createStructure.mutate()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent onClose={() => setAssignOpen(false)}>
          <DialogHeader>
            <DialogTitle>Bill students</DialogTitle>
            <DialogDescription>
              Choose a fee amount, then a school section or class. Primary applies that amount to every class under Primary.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Year</Label>
              <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
                <option value="">Select year</option>
                {(years.data?.items ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}{y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Fee amount</Label>
              <Select value={feeBracket} onChange={(e) => setFeeBracket(e.target.value)}>
                <option value="">Select amount</option>
                {bracketAmounts.map((amount) => (
                  <option key={amount} value={String(amount)}>
                    {formatPkr(amount)}
                  </option>
                ))}
              </Select>
              {!showNewBracket ? (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setShowNewBracket(true)}>
                  Add new amount
                </Button>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="6500"
                    value={newBracket}
                    onChange={(e) => setNewBracket(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={addBracket}>
                    Add
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label>Section / class</Label>
              <Select value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
                <option value="">Select</option>
                {(stages.data ?? []).length ? (
                  <optgroup label="School sections">
                    {(stages.data ?? []).map((stage) => (
                      <option key={stage.id} value={`stage:${stage.id}`}>
                        {stage.name}
                        {stage.grades?.length ? ` (${stage.grades.map((g) => g.name).join(", ")})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {(grades.data?.items ?? []).length ? (
                  <optgroup label="Classes">
                    {(grades.data?.items ?? []).map((grade) => (
                      <option key={grade.id} value={`grade:${grade.id}`}>
                        {grade.name}
                        {grade.stage?.name ? ` · ${grade.stage.name}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
              {selectedTargetLabel ? (
                <p className="mt-1 text-sm text-muted-foreground">Will apply to: {selectedTargetLabel}</p>
              ) : null}
            </div>

            <div>
              <Label>Period</Label>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="September 2026" />
            </div>
            <div>
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <Button onClick={() => assign.mutate()} disabled={assign.isPending || !canAssign}>
              {assign.isPending ? "Billing…" : "Apply fee and create bills"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
