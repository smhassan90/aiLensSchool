"use client";

import { useQuery } from "@tanstack/react-query";
import { AcademicInsightsView } from "@/components/head-teachers/academic-insights-view";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { personFullName } from "@/lib/person-name";
import { useAuth } from "@/providers/auth-provider";
import { headTeachersService } from "@/services/head-teachers.service";
import { teachersService } from "@/services/teachers.service";
import { ApiClientError } from "@/lib/api-client";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

export default function HeadTeacherDashboardPage() {
  const { user } = useAuth();
  const assignment = useQuery({
    queryKey: ["head-teacher-me"],
    queryFn: () => headTeachersService.getMyAssignment(),
  });
  const supervision = useQuery({
    queryKey: ["teacher-supervision"],
    queryFn: () => teachersService.getSupervision(),
  });
  const hasAssignment = Boolean(assignment.data?.sections?.length);
  const dashboard = useQuery({
    queryKey: ["head-teacher-dashboard"],
    queryFn: () => headTeachersService.getDashboard(),
    enabled: hasAssignment,
  });

  if (assignment.isLoading || (hasAssignment && dashboard.isLoading)) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" phrases={["Loading academic insights"]} />
      </div>
    );
  }

  if (assignment.isError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-center shadow-sm">
          <p className="font-display text-lg text-slate-900">Could not load academic insights</p>
          <p className="mt-2 text-sm text-slate-600">
            {friendlyApiErrorMessage(assignment.error, "Check your connection and try again.")}
          </p>
          <Button type="button" className="mt-4" onClick={() => assignment.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!assignment.data?.sections?.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
          <p className="font-display text-lg text-slate-900">Academic insights</p>
          <p className="mt-2 text-sm text-slate-500">
            Head teacher access is not set up for your account. Ask your school admin to assign you on
            the head teacher board and link at least one class.
          </p>
        </div>
      </div>
    );
  }

  if (dashboard.isError) {
    const notHead =
      dashboard.error instanceof ApiClientError &&
      (dashboard.error.code === "HEAD_TEACHER_REQUIRED" || dashboard.error.status === 403);
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div
          className={`rounded-2xl border px-6 py-12 text-center shadow-sm ${
            notHead ? "border-dashed border-slate-200 bg-white" : "border-rose-200 bg-rose-50"
          }`}
        >
          <p className="font-display text-lg text-slate-900">
            {notHead ? "Academic insights unavailable" : "Could not load academic insights"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {notHead
              ? "Your head teacher assignment may have been removed. Ask your school admin to review the head teacher board."
              : friendlyApiErrorMessage(dashboard.error, "Check your connection and try again.")}
          </p>
          {!notHead ? (
            <Button type="button" className="mt-4" onClick={() => dashboard.refetch()}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const data = dashboard.data;
  if (!data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" phrases={["Loading academic insights"]} />
      </div>
    );
  }

  const signedInName = user ? personFullName(user.firstName, user.lastName) : null;
  const supervisesStaff = (supervision.data?.supervisedTeachers.length ?? 0) > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AcademicInsightsView data={data} signedInName={signedInName} supervisesStaff={supervisesStaff} />
    </div>
  );
}
