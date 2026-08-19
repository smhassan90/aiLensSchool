import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const LESSON_WIZARD_STEPS = [
  { key: "upload", label: "Upload" },
  { key: "content", label: "Content" },
  { key: "homework", label: "Homework" },
  { key: "review", label: "Confirm" },
] as const;

export type LessonWizardStep = (typeof LESSON_WIZARD_STEPS)[number]["key"];

export function LessonWizardSteps({ current }: { current: LessonWizardStep }) {
  const currentIndex = LESSON_WIZARD_STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="mb-6 grid grid-cols-4 gap-2">
      {LESSON_WIZARD_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.key} className="min-w-0">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-2 sm:px-3",
                active && "border-primary/40 bg-primary/5",
                done && "border-emerald-200 bg-emerald-50/70",
                !active && !done && "border-border bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-emerald-600 text-white",
                  !active && !done && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate text-xs font-medium sm:text-sm",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
