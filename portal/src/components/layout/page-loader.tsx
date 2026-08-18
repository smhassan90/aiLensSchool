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
        {phrases[index]}
      </p>
    </div>
  );
}
