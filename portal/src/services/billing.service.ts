import { apiClient, buildQuery } from "@/lib/api-client";
import type { AuditLog, Invoice, Paginated, PricingPlan } from "@/lib/types";

export const billingService = {
  listPlans(params?: { page?: number; limit?: number }) {
    return apiClient<Paginated<PricingPlan>>(`/billing/plans${buildQuery(params ?? {})}`);
  },

  listInvoices(params?: { page?: number; limit?: number; schoolId?: string }) {
    return apiClient<Paginated<Invoice>>(`/billing/invoices${buildQuery(params ?? {})}`);
  },
};

export const auditService = {
  list(params?: { page?: number; limit?: number; schoolId?: string; action?: string }) {
    return apiClient<Paginated<AuditLog>>(`/audit-logs${buildQuery(params ?? {})}`);
  },
};

export const usersService = {
  list(params?: { page?: number; limit?: number; search?: string; schoolId?: string }) {
    return apiClient<Paginated<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      status: string;
      school?: { name: string };
    }>>(`/users${buildQuery(params ?? {})}`);
  },
};
