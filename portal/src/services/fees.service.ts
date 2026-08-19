import { apiClient, buildQuery } from "@/lib/api-client";
import type { FeeStructure, Paginated, StudentFee } from "@/lib/types";

export const feesService = {
  listStructures() {
    return apiClient<Paginated<FeeStructure>>("/fees/structures?limit=50");
  },
  createStructure(payload: { name: string; amount: number; frequency?: string; description?: string }) {
    return apiClient<FeeStructure>("/fees/structures", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  assign(payload: {
    feeStructureId: string;
    academicYearId: string;
    periodLabel: string;
    dueDate: string;
    sectionId?: string;
    studentIds?: string[];
  }) {
    return apiClient<{ assigned: number }>("/fees/assign", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  list(params?: { search?: string; status?: string; studentId?: string; sectionId?: string; limit?: number }) {
    return apiClient<Paginated<StudentFee>>(`/fees${buildQuery(params ?? {})}`);
  },
  pay(payload: { studentFeeId: string; amount: number; method?: string; reference?: string }) {
    return apiClient("/fees/payments", { method: "POST", body: JSON.stringify(payload) });
  },
  markPaid(studentFeeId: string) {
    return apiClient("/fees/mark-paid", { method: "POST", body: JSON.stringify({ studentFeeId }) });
  },
};
