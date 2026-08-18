"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Calendar,
  ChevronRight,
  FileQuestion,
  IdCard,
  KeyRound,
  Library,
  Megaphone,
  Settings,
  Sparkles,
  Trophy,
  UserSquare2,
  Users,
  Wallet,
  ClipboardCheck,
  CreditCard,
  BarChart3,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { dashboardService } from "@/services/dashboard.service";
import type { StaffPermission } from "@/lib/types";

type SetupItem = {
  href: string;
  title: string;
  description: string;
  icon: typeof Calendar;
  permission?: StaffPermission;
};

type SetupSection = {
  title: string;
  hint: string;
  items: SetupItem[];
};

const setupSections: SetupSection[] = [
  {
    title: "Year & classes",
    hint: "Usually done once at the start of each school year",
    items: [
      {
        href: "/school/academics/years",
        title: "School year",
        description: "Start and end dates for the current session",
        icon: Calendar,
        permission: "MANAGE_CLASSES",
      },
      {
        href: "/school/academics/grades",
        title: "Classes & sections",
        description: "Create classes, sections and assign class teachers",
        icon: BookOpen,
        permission: "MANAGE_CLASSES",
      },
      {
        href: "/school/academics/subjects",
        title: "Subjects",
        description: "Subjects taught in each class",
        icon: Library,
        permission: "MANAGE_CLASSES",
      },
      {
        href: "/school/exams",
        title: "Exams & quiz targets",
        description: "Exam pattern and minimum quizzes per subject",
        icon: Trophy,
        permission: "MANAGE_EXAMS",
      },
    ],
  },
  {
    title: "People",
    hint: "Add staff when someone joins; update when roles change",
    items: [
      {
        href: "/school/teachers",
        title: "Teachers",
        description: "Add teachers, assign classes and review progress",
        icon: UserSquare2,
      },
      {
        href: "/school/staff",
        title: "Staff access",
        description: "Principal and staff logins with permissions",
        icon: KeyRound,
        permission: "MANAGE_STAFF",
      },
      {
        href: "/school/parents",
        title: "Parents",
        description: "Parent accounts linked to students",
        icon: Users,
      },
    ],
  },
  {
    title: "Fees",
    hint: "Set admission and tuition amounts per class — collect payments from the main Fees page",
    items: [
      {
        href: "/school/fees?focus=types",
        title: "Fee types",
        description: "Admission fee, monthly tuition and other charges",
        icon: Wallet,
        permission: "VIEW_FINANCE",
      },
    ],
  },
  {
    title: "School details",
    hint: "Occasional updates — not needed every day",
    items: [
      {
        href: "/school/settings",
        title: "School profile",
        description: "Name, phone and address on reports",
        icon: Settings,
      },
      {
        href: "/school/id-cards",
        title: "ID cards",
        description: "Print student and staff cards",
        icon: IdCard,
      },
      {
        href: "/school/announcements",
        title: "Announcements",
        description: "Notices for parents and staff",
        icon: Megaphone,
      },
      {
        href: "/school/events",
        title: "Events",
        description: "Holidays, meetings and school calendar",
        icon: Calendar,
      },
    ],
  },
  {
    title: "Learning overview",
    hint: "Check how teaching is going — day-to-day work stays with teachers",
    items: [
      {
        href: "/school/lessons",
        title: "Lessons",
        description: "What teachers have uploaded",
        icon: BookOpen,
      },
      {
        href: "/school/quizzes",
        title: "Quizzes",
        description: "Tests created across the school",
        icon: FileQuestion,
      },
      {
        href: "/school/results",
        title: "Quiz scores",
        description: "Results by class and subject",
        icon: BarChart3,
      },
      {
        href: "/school/attendance",
        title: "Attendance",
        description: "School-wide attendance records",
        icon: ClipboardCheck,
      },
      {
        href: "/school/report-cards",
        title: "Report cards",
        description: "Generate term report cards",
        icon: CreditCard,
        permission: "GENERATE_REPORT_CARDS",
      },
    ],
  },
];

function SetupCard({ item }: { item: SetupItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group flex items-start gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
    >
      <div className="rounded-md bg-muted p-2.5 text-muted-foreground group-hover:text-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function canSeeTeachers(can: (p: StaffPermission) => boolean) {
  return can("MANAGE_TEACHERS") || can("VIEW_TEACHER_PROGRESS");
}

export default function SetupHubPage() {
  const { can } = useAuth();
  const dashboard = useQuery({
    queryKey: ["school-dashboard"],
    queryFn: () => dashboardService.school(),
    staleTime: 60_000,
  });
  const setupDone = dashboard.data?.setupCompleted === true;
  const showWizard = can("MANAGE_CLASSES") && !setupDone;

  const visibleSections = setupSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.href === "/school/teachers" && item.title === "Teachers") {
          return canSeeTeachers(can);
        }
        if (!item.permission) return true;
        return can(item.permission);
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Setup"
        description="One-time and yearly configuration — classes, fees, teachers and school details."
      />

      {showWizard ? (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="rounded-md bg-primary/10 p-2.5 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">New school? Start here</p>
                <p className="text-sm text-muted-foreground">
                  Create your year, classes, subjects and exam pattern in one step.
                </p>
              </div>
            </div>
            <Link href="/school/setup/wizard">
              <Button>Run quick start</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-8">
        {visibleSections.map((section) => (
          <section key={section.title}>
            <div className="mb-3">
              <h2 className="text-sm font-semibold">{section.title}</h2>
              <p className="text-xs text-muted-foreground">{section.hint}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => (
                <SetupCard key={`${item.href}-${item.title}`} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
