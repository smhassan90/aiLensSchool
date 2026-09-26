"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

type TabDef = {
  href: string;
  label: string;
  /** Setup → Attendance sub-tab (query `tab`) */
  setupTab?: "mapping" | "configuration" | "devices";
  /** Only on exact path (Today) */
  exact?: boolean;
  visible?: boolean;
};

export function TeacherAttendanceTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const canBiometric = can("VIEW_BIOMETRIC_DEVICES") || can("MANAGE_TEACHERS");
  const canToday = can("MANAGE_TEACHERS");
  const canHistory = can("VIEW_TEACHER_ATTENDANCE_HISTORY") || can("MANAGE_TEACHERS");

  const setupPath = pathname.startsWith("/school/setup/attendance");
  const setupTab = setupPath ? searchParams.get("tab") : null;

  const tabs: TabDef[] = [
    {
      href: "/school/teachers/attendance",
      label: "Today",
      exact: true,
      visible: canToday,
    },
    {
      href: "/school/teachers/attendance/history",
      label: "History",
      visible: canHistory,
    },
    {
      href: "/school/teachers/attendance/devices",
      label: "Device sync",
      visible: canBiometric,
    },
    {
      href: "/school/setup/attendance?tab=mapping",
      label: "Map teachers",
      setupTab: "mapping",
      visible: canBiometric,
    },
    {
      href: "/school/setup/attendance?tab=configuration",
      label: "Configuration",
      setupTab: "configuration",
      visible: canBiometric,
    },
    {
      href: "/school/setup/attendance?tab=devices",
      label: "Terminals",
      setupTab: "devices",
      visible: canBiometric,
    },
  ];

  const visibleTabs = tabs.filter((tab) => tab.visible !== false);

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-2">
      {visibleTabs.map((tab) => {
        const active = tab.setupTab
          ? setupPath && (setupTab === tab.setupTab || (!setupTab && tab.setupTab === "mapping"))
          : tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
