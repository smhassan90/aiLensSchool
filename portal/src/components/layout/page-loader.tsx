"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type LoaderTask =
  | "page"
  | "list"
  | "lessons"
  | "lesson-review"
  | "homework"
  | "quizzes"
  | "quiz"
  | "teacher"
  | "school"
  | "admin";

const TASK_PHRASES: Record<LoaderTask, string[]> = {
  page: ["Opening this screen", "Getting it ready", "Almost there"],
  list: ["Loading this list", "Fetching the latest records", "Almost ready"],
  lessons: ["Loading today’s lessons", "Checking extracted pages", "Almost ready"],
  "lesson-review": [
    "Opening the extracted lesson",
    "Loading key points and homework",
    "Almost ready",
  ],
  homework: ["Loading homework", "Checking assignments for this class", "Almost ready"],
  quizzes: ["Loading quizzes", "Checking drafts and published papers", "Almost ready"],
  quiz: ["Opening this quiz", "Loading the questions", "Almost ready"],
  teacher: ["Opening the teacher hub", "Checking your classes", "Almost there"],
  school: ["Opening the school workspace", "Loading school records", "Almost there"],
  admin: ["Opening admin tools", "Loading platform records", "Almost there"],
};

type LoaderVariant = "screen" | "page" | "panel";

interface PageLoaderProps {
  variant?: LoaderVariant;
  task?: LoaderTask;
  phrases?: string[];
  className?: string;
}

export function PageLoader({
  variant = "page",
  task = "page",
  phrases,
  className,
}: PageLoaderProps) {
  const lines = phrases?.length ? phrases : TASK_PHRASES[task];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (lines.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [lines.length]);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "screen" && "min-h-screen bg-background",
        variant === "page" && "min-h-[28rem] px-6",
        variant === "panel" && "min-h-[13rem] px-4 py-8",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={lines[index] ?? "Loading"}
    >
      <img
        src="/brand/hawk.png"
        alt=""
        className={cn("object-contain", variant === "panel" ? "h-14 w-14" : "h-20 w-20")}
      />
      <p
        className={cn(
          "mt-5 font-display font-semibold tracking-tight text-slate-800",
          variant === "panel" ? "text-base" : "text-xl",
        )}
      >
        <span className="text-teal-600">Hawk</span>
        <span className="text-amber-600">Nexa</span>
      </p>
      <p
        key={index}
        className="loader-phrase mt-2 max-w-xs text-sm text-muted-foreground"
      >
        {lines[index]}
      </p>
    </div>
  );
}
