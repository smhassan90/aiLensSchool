"use client";

import { useQuery } from "@tanstack/react-query";
import { AcademicInsightsView } from "@/components/head-teachers/academic-insights-view";
import { PageLoader } from "@/components/layout/page-loader";
import { personFullName } from "@/lib/person-name";
import { useAuth } from "@/providers/auth-provider";
import { headTeachersService } from "@/services/head-teachers.service";

export default function HeadTeacherDashboardPage() {
  const { user } = useAuth();
  const dashboard = useQuery({
    queryKey: ["head-teacher-dashboard"],
    queryFn: () => headTeachersService.getDashboard(),
  });

  if (dashboard.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" phrases={["Loading academic insights"]} />
      </div>
    );
  }

  const data = dashboard.data;
  if (!data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
          <p className="font-display text-lg text-slate-900">Academic insights</p>
          <p className="mt-2 text-sm text-slate-500">
            Head teacher access is not set up for your account. Ask your school admin to assign you on
            the head teacher board.
          </p>
        </div>
      </div>
    );
  }

  const overseerName = user ? personFullName(user.firstName, user.lastName) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AcademicInsightsView data={data} overseerName={overseerName} />
    </div>
  );
}
