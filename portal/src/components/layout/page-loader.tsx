"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_PHRASES = [
  "Bringing your school into focus",
  "Gathering the latest picture",
  "Almost ready",
];

type LoaderVariant = "screen" | "page" | "panel";

interface PageLoaderProps {
  variant?: LoaderVariant;
  phrases?: string[];
  className?: string;
}

export function PageLoader({
  variant = "page",
  phrases = DEFAULT_PHRASES,
  className,
}: PageLoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (phrases.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % phrases.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [phrases.length]);

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
      aria-label={phrases[index] ?? "Loading"}
    >
      <LensMark size={variant === "panel" ? "sm" : "md"} />
      <p
        className={cn(
          "mt-5 font-display font-semibold tracking-tight text-slate-800",
          variant === "panel" ? "text-base" : "text-xl",
        )}
      >
        <span className="text-teal-600">Ai</span>
        <span>School</span>
        <span className="text-amber-600">Lens</span>
      </p>
      <p
        key={index}
        className="loader-phrase mt-2 max-w-xs text-sm text-muted-foreground"
      >
        {phrases[index]}
      </p>
    </div>
  );
}

function LensMark({ size }: { size: "sm" | "md" }) {
  const box = size === "sm" ? "h-16 w-16" : "h-24 w-24";
  const core = size === "sm" ? "inset-[30%]" : "inset-[28%]";
  const spark = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <div className={cn("relative", box)} aria-hidden>
      <span className="lens-glow absolute -inset-4 rounded-full bg-gradient-to-br from-teal-400/30 via-teal-200/10 to-amber-300/30 blur-2xl" />
      <span className="absolute inset-0 rounded-full border-[3px] border-teal-600/15" />
      <span className="lens-spin absolute inset-0 rounded-full border-[3px] border-transparent border-t-teal-600 border-r-teal-400/80" />
      <span className="lens-spin-rev absolute inset-[10%] rounded-full border-2 border-transparent border-b-amber-500 border-l-amber-400/80" />
      <span
        className={cn(
          "lens-core absolute rounded-full bg-gradient-to-br from-white via-teal-50 to-amber-50 shadow-[inset_0_1px_8px_rgba(13,148,136,0.18)]",
          core,
        )}
      />
      <span className="lens-spin absolute inset-0">
        <span
          className={cn(
            "absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.75)]",
            spark,
          )}
        />
      </span>
    </div>
  );
}
