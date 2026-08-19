"use client";

import { PageLoader } from "@/components/layout/page-loader";

export type AiWaitKind = "extract" | "key-points" | "homework" | "diary" | "quiz" | "coach";

const AI_WAIT: Record<
  AiWaitKind,
  { phrases: string[]; hint: string }
> = {
  extract: {
    phrases: [
      "Reading the textbook pages",
      "Finding the chapter and topic",
      "Writing a lesson summary",
      "Picking key points for this class",
      "Preparing the review for you",
    ],
    hint: "The page is read in your browser first, then turned into a lesson. Stay on this page.",
  },
  "key-points": {
    phrases: [
      "Reading the lesson with your instructions",
      "Keeping the ideas that matter most",
      "Rewriting them in the style you asked for",
      "Checking that each point is complete",
      "Fresh key points are almost ready",
    ],
    hint: "We are rewriting the points, not the extracted page text.",
  },
  homework: {
    phrases: [
      "Using today’s lesson, not a generic worksheet",
      "Matching the difficulty you asked for",
      "Choosing practice students can finish",
      "Writing it in the right words for this grade",
      "A homework draft is coming together",
    ],
    hint: "Nothing is saved until you review and confirm the homework.",
  },
  diary: {
    phrases: [
      "Turning the lesson into a note for home",
      "Keeping the language clear for parents",
      "Linking what was taught with what to practice",
      "A short diary is almost ready",
    ],
    hint: "Parents will only see this after you save the diary.",
  },
  quiz: {
    phrases: [
      "Reading the homework topics you selected",
      "Writing a short quiz headline",
      "Building questions from those topics",
      "Mixing recall and thinking questions",
      "Checking that answers stay fair",
      "Your quiz draft is almost ready",
    ],
    hint: "The headline is written by the system. Stay on this page.",
  },
  coach: {
    phrases: [
      "Reading lessons, attendance, and quiz scores",
      "Comparing this class with the usual pace",
      "Writing a short hint you can use today",
      "Almost ready",
    ],
    hint: "This is a suggestion from the numbers, not a judgement.",
  },
};

export function AiWait({
  kind,
  variant = "panel",
}: {
  kind: AiWaitKind;
  variant?: "page" | "panel";
}) {
  const wait = AI_WAIT[kind];

  return (
    <div className="rounded-xl border border-primary/15 bg-gradient-to-b from-teal-50/70 via-background to-amber-50/40">
      <PageLoader variant={variant} phrases={wait.phrases} className="px-6 py-8" />
      <p className="mx-auto max-w-sm px-6 pb-6 text-center text-xs leading-relaxed text-muted-foreground">
        {wait.hint}
      </p>
    </div>
  );
}
