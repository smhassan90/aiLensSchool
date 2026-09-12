import { apiClient, buildQuery } from "@/lib/api-client";
import { currentMonthLabel, feeBelongsToThisMonth, feeIsStillDue } from "@/lib/fees-month";
import type {
  ClassFeeStatus,
  FeeAccount,
  FeeCollection,
  FeeLookupItem,
  FeeReceipt,
  FeeStructure,
  Paginated,
  StudentFee,
} from "@/lib/types";

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
  list(params?: {
    search?: string;
    status?: string;
    studentId?: string;
    sectionId?: string;
    dueThisMonth?: boolean | string;
    month?: string;
    limit?: number;
    page?: number;
  }) {
    const { dueThisMonth, ...rest } = params ?? {};
    return apiClient<Paginated<StudentFee> & { monthLabel?: string }>(
      `/fees${buildQuery({
        ...rest,
        dueThisMonth: dueThisMonth ? "true" : undefined,
      })}`,
    );
  },
  listCollections(params?: { search?: string; sectionId?: string; month?: string; limit?: number; page?: number }) {
    return apiClient<Paginated<FeeCollection> & { totalAmount: number; monthLabel: string }>(
      `/fees/collections${buildQuery(params ?? {})}`,
    );
  },
  async listDueThisMonth(params?: { search?: string; sectionId?: string; limit?: number }) {
    const shared = {
      search: params?.search,
      sectionId: params?.sectionId,
      limit: params?.limit ?? 100,
    };
    const [due, partial] = await Promise.all([
      feesService.list({ ...shared, status: "DUE" }),
      feesService.list({ ...shared, status: "PARTIAL" }),
    ]);
    const inMonth = [...due.items, ...partial.items].filter(
      (fee) => feeIsStillDue(fee) && feeBelongsToThisMonth(fee),
    );
    return {
      unpaid: inMonth.filter((fee) => fee.status !== "PARTIAL"),
      partial: inMonth.filter((fee) => fee.status === "PARTIAL"),
      monthLabel: currentMonthLabel(),
    };
  },
  async listCollectionsThisMonth(params?: { search?: string; sectionId?: string; limit?: number }) {
    try {
      return await feesService.listCollections(params);
    } catch {
      return {
        items: [],
        page: 1,
        limit: params?.limit ?? 20,
        total: 0,
        totalPages: 1,
        totalAmount: 0,
        monthLabel: currentMonthLabel(),
      };
    }
  },
  classMonthStatus(params: { gradeId?: string; sectionId?: string; month?: string }) {
    return apiClient<ClassFeeStatus>(`/fees/class-status${buildQuery(params)}`);
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
