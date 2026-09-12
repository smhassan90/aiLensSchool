"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboard.service";
import { teachersService } from "@/services/teachers.service";
import { lessonsService } from "@/services/lessons.service";
import { homeworkService } from "@/services/homework.service";
import { quizzesService } from "@/services/quizzes.service";
import { resultsService } from "@/services/results.service";
import { academicsService } from "@/services/academics.service";
import { studentsService } from "@/services/students.service";

type PrefetchItem = {
  key: readonly unknown[];
  fn: () => Promise<unknown>;
};

const TEACHER_MENU_PREFETCH: PrefetchItem[] = [
  { key: ["teacher-dashboard"], fn: () => dashboardService.teacher() },
  { key: ["teacher-classes"], fn: () => teachersService.myClasses() },
  { key: ["teacher-lessons"], fn: () => lessonsService.list({ limit: 50 }) },
  { key: ["homework"], fn: () => homeworkService.list({ limit: 50 }) },
  { key: ["teacher-quizzes"], fn: () => quizzesService.list({ limit: 50 }) },
  { key: ["teacher-exam-papers"], fn: () => quizzesService.list({ limit: 50, paperKind: "EXAM" }) },
  { key: ["results"], fn: () => resultsService.list({ limit: 100 }) },
];

const SCHOOL_MENU_PREFETCH: PrefetchItem[] = [
  { key: ["school-dashboard"], fn: () => dashboardService.school() },
  { key: ["sections"], fn: () => academicsService.listSections({ limit: 100 }) },
  { key: ["subjects"], fn: () => academicsService.listSubjects({ limit: 100 }) },
  { key: ["grades"], fn: () => academicsService.listGrades({ limit: 50 }) },
  { key: ["academic-years"], fn: () => academicsService.listYears({ limit: 20 }) },
  { key: ["teachers"], fn: () => teachersService.list({ limit: 50 }) },
  { key: ["students-roster", "", "", ""], fn: () => studentsService.listAll() },
  { key: ["homework"], fn: () => homeworkService.list({ limit: 50 }) },
  { key: ["quizzes"], fn: () => quizzesService.list({ limit: 50 }) },
];

const HREF_PREFETCH: Record<string, PrefetchItem[]> = {
  "/teacher/dashboard": [TEACHER_MENU_PREFETCH[0]],
  "/teacher/classes": [TEACHER_MENU_PREFETCH[1]],
  "/teacher/attendance": [TEACHER_MENU_PREFETCH[1]],
  "/teacher/lessons": [TEACHER_MENU_PREFETCH[2], TEACHER_MENU_PREFETCH[1]],
  "/teacher/homework": [TEACHER_MENU_PREFETCH[3], TEACHER_MENU_PREFETCH[1]],
  "/teacher/quizzes": [TEACHER_MENU_PREFETCH[4], TEACHER_MENU_PREFETCH[1]],
  "/teacher/exams": [TEACHER_MENU_PREFETCH[5], TEACHER_MENU_PREFETCH[1]],
  "/teacher/marks": [TEACHER_MENU_PREFETCH[1]],
  "/teacher/results": [TEACHER_MENU_PREFETCH[6]],
  "/school/dashboard": [SCHOOL_MENU_PREFETCH[0]],
  "/school/academics": [SCHOOL_MENU_PREFETCH[1], SCHOOL_MENU_PREFETCH[2], SCHOOL_MENU_PREFETCH[3]],
  "/school/teachers": [SCHOOL_MENU_PREFETCH[5]],
  "/school/students": [SCHOOL_MENU_PREFETCH[6]],
  "/school/homework": [SCHOOL_MENU_PREFETCH[7], SCHOOL_MENU_PREFETCH[1], SCHOOL_MENU_PREFETCH[2]],
  "/school/quizzes": [SCHOOL_MENU_PREFETCH[8], SCHOOL_MENU_PREFETCH[1], SCHOOL_MENU_PREFETCH[2]],
};

function runWhenIdle(cb: () => void, delayMs = 400) {
  if (typeof window === "undefined") return () => undefined;
  let idleId: number | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const ric = window.requestIdleCallback?.bind(window);
  const cic = window.cancelIdleCallback?.bind(window);
  if (ric) {
    idleId = ric(() => cb(), { timeout: 2500 });
  } else {
    timeoutId = setTimeout(cb, delayMs);
  }
  return () => {
    if (idleId != null && cic) cic(idleId);
    if (timeoutId) clearTimeout(timeoutId);
  };
}

async function prefetchItems(
  queryClient: ReturnType<typeof useQueryClient>,
  items: PrefetchItem[],
  options?: { gapMs?: number; signal?: { cancelled: boolean } },
) {
  const gapMs = options?.gapMs ?? 300;
  for (const item of items) {
    if (options?.signal?.cancelled) return;
    const state = queryClient.getQueryState(item.key as unknown[]);
    const fresh =
      state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < 60_000 && state.data != null;
    if (fresh) continue;
    try {
      await queryClient.prefetchQuery({
        queryKey: item.key as unknown[],
        queryFn: item.fn,
        staleTime: 60_000,
      });
    } catch {
      // Ignore background failures; the page will retry on open.
    }
    if (gapMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
  }
}

function useBackgroundPrefetch(items: PrefetchItem[]) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const signal = { cancelled: false };
    const cancelIdle = runWhenIdle(() => {
      void prefetchItems(queryClient, items, { signal, gapMs: 350 });
    });
    return () => {
      signal.cancelled = true;
      cancelIdle();
    };
    // Prefetch lists are module-level constants; only re-run if the query client changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}

export function TeacherBackgroundPrefetch() {
  useBackgroundPrefetch(TEACHER_MENU_PREFETCH);
  return null;
}

export function SchoolBackgroundPrefetch() {
  useBackgroundPrefetch(SCHOOL_MENU_PREFETCH);
  return null;
}

/** Warm caches when the user hovers a sidebar link. */
export function prefetchMenuHref(
  queryClient: ReturnType<typeof useQueryClient>,
  href: string,
) {
  const match =
    HREF_PREFETCH[href] ??
    Object.entries(HREF_PREFETCH).find(([path]) => href.startsWith(`${path}/`))?.[1];
  if (!match?.length) return;
  void prefetchItems(queryClient, match, { gapMs: 0 });
}
