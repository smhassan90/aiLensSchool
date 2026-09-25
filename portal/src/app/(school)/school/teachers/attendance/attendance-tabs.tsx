"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/school/teachers/attendance", label: "Today" },
  { href: "/school/teachers/attendance/history", label: "History" },
  { href: "/school/teachers/attendance/devices", label: "Device sync" },
];

export function TeacherAttendanceTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-2">
      {tabs.map((tab) => {
        const active =
          tab.href === "/school/teachers/attendance"
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
