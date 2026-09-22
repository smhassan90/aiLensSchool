"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { schoolsService } from "@/services/schools.service";

export function useSchoolBranding() {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? null;

  const query = useQuery({
    queryKey: ["school-branding", schoolId],
    queryFn: () => schoolsService.getById(schoolId!),
    enabled: Boolean(schoolId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    school: query.data,
    schoolName: query.data?.name ?? null,
    schoolLogo: query.data?.logo ?? null,
    isLoading: query.isLoading,
  };
}
