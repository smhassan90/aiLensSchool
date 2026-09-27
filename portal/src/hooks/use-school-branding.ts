"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { readSchoolBrandingCache, writeSchoolBrandingCache } from "@/lib/school-branding-cache";
import { schoolsService } from "@/services/schools.service";

export function useSchoolBranding() {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? null;

  const cached = useMemo(
    () => (schoolId ? readSchoolBrandingCache(schoolId) : undefined),
    [schoolId],
  );

  const query = useQuery({
    queryKey: ["school-branding", schoolId],
    queryFn: async () => {
      const branding = await schoolsService.getBranding();
      if (schoolId) writeSchoolBrandingCache(schoolId, branding);
      return branding;
    },
    enabled: Boolean(schoolId),
    staleTime: 5 * 60 * 1000,
    placeholderData: cached,
  });

  const school = query.data ?? cached;

  return {
    school,
    schoolName: school?.name ?? null,
    schoolLogo: school?.logo ?? null,
    isLoading: query.isLoading && !school,
  };
}
