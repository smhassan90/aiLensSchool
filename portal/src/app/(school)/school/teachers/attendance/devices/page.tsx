"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TeacherAttendanceTabs } from "../attendance-tabs";
import { DeviceTeacherMappingPanel } from "@/components/attendance/device-teacher-mapping-panel";

export default function TeacherAttendanceDevicesPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teacher attendance"
        description="Pull users and punches when the API runs on the school LAN. Otherwise use the edge sync agent from Setup."
      />
      <TeacherAttendanceTabs />
      <DeviceTeacherMappingPanel
        setupHref="/school/setup/attendance?tab=devices"
        showSetupHint
      />
    </div>
  );
}
