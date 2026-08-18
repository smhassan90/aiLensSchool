"use client";

import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { expensesService } from "@/services/school-ops.service";
import { useToast } from "@/providers/toast-provider";

const CATEGORIES = [
  ["TEACHER_SALARY", "Teacher salary"],
  ["ADMIN_SALARY", "Admin salary"],
  ["ELECTRICITY", "Electricity"],
  ["GAS", "Gas"],
  ["WATER", "Water"],
  ["RENT", "Rent"],
  ["REPAIR", "Repair (one time)"],
  ["SUPPLIES", "Supplies"],
  ["TRANSPORT", "Transport"],
  ["MISC", "Other"],
];

export default function ExpensesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["expenses"], queryFn: () => expensesService.list() });
  const create = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return expensesService.create({
        title: String(data.get("title")),
        category: String(data.get("category")),
        amount: Number(data.get("amount")),
        recurrence: String(data.get("recurrence")),
        expenseDate: String(data.get("expenseDate")),
      });
    },
    onSuccess: () => {
      toast({ title: "Expense saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["school-dashboard"] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "error" }),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    create.mutate(e.currentTarget);
    e.currentTarget.reset();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Salaries & bills" description="Monthly bills stay as Monthly. Repairs are One time." />
      <form onSubmit={onSubmit} className="mb-8 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2"><Label>What is it?</Label><Input name="title" required placeholder="April salaries" /></div>
        <div>
          <Label>Type</Label>
          <select name="category" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div><Label>Amount</Label><Input name="amount" type="number" min={0} required /></div>
        <div>
          <Label>Repeats?</Label>
          <select name="recurrence" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="MONTHLY">Every month</option>
            <option value="ONE_TIME">One time</option>
            <option value="QUARTERLY">Every 3 months</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </div>
        <div><Label>Date</Label><Input name="expenseDate" type="date" required /></div>
        <div className="flex items-end"><Button type="submit">Add</Button></div>
      </form>
      <div className="space-y-2">
        {(list.data ?? []).map((row) => (
          <Card key={row.id}><CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.category.replaceAll("_", " ")} · {row.recurrence.replaceAll("_", " ")}</p>
            </div>
            <p className="font-semibold">{Number(row.amount)}</p>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
