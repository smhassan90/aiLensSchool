import { apiClient, buildQuery } from "@/lib/api-client";
import type { FeeAccount, FeeLookupItem, FeeReceipt, FeeStructure, Paginated, StudentFee } from "@/lib/types";

export const feesService = {
  listStructures() {
    return apiClient<Paginated<FeeStructure>>("/fees/structures?limit=50");
  },
  listBrackets() {
    return apiClient<{ amounts: number[] }>("/fees/brackets");
  },
  createStructure(payload: {
    name: string;
    amount: number;
    frequency?: string;
    description?: string;
    gradeId?: string;
  }) {
    return apiClient<FeeStructure>("/fees/structures", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  assign(payload: {
    feeStructureId?: string;
    academicYearId: string;
    periodLabel: string;
    dueDate: string;
    sectionId?: string;
    stageId?: string;
    gradeId?: string;
    amount?: number;
    useClassTuition?: boolean;
    studentIds?: string[];
  }) {
    return apiClient<{ assigned: number; classesUpdated?: number; amount?: number; classes?: string[] }>(
      "/fees/assign",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
  list(params?: { search?: string; status?: string; studentId?: string; sectionId?: string; limit?: number }) {
    return apiClient<Paginated<StudentFee>>(`/fees${buildQuery(params ?? {})}`);
  },
  lookup(q: string) {
    return apiClient<{ items: FeeLookupItem[] }>(`/fees/lookup${buildQuery({ q })}`);
  },
  getAccount(studentId: string) {
    return apiClient<FeeAccount>(`/fees/account/${studentId}`);
  },
  collect(payload: {
    studentId: string;
    studentFeeId?: string;
    feeStructureId?: string;
    periodLabel?: string;
    billedAmount?: number;
    collectedAmount: number;
    discountAmount?: number;
    method?: string;
    notes?: string;
  }) {
    return apiClient<FeeReceipt>("/fees/collect", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getReceipt(id: string) {
    return apiClient<FeeReceipt>(`/fees/receipts/${id}`);
  },
  pay(payload: { studentFeeId: string; amount: number; method?: string; reference?: string }) {
    return apiClient("/fees/payments", { method: "POST", body: JSON.stringify(payload) });
  },
  markPaid(studentFeeId: string) {
    return apiClient("/fees/mark-paid", { method: "POST", body: JSON.stringify({ studentFeeId }) });
  },
};
