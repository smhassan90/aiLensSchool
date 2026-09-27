import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  variant?: "full" | "lockup";
  inverted?: boolean;
  className?: string;
  subtitle?: string;
};

function HawkIcon({
  size,
  inverted,
  priority,
}: {
  size: number;
  inverted: boolean;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        inverted && "rounded-md bg-white p-0.5",
      )}
    >
      <Image
        src="/brand/hawk-160.webp"
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        priority={priority}
        className="object-contain"
      />
    </span>
  );
}

function Wordmark({
  inverted,
  size,
}: {
  inverted: boolean;
  size: "sm" | "lg";
}) {
  return (
    <p
      className={cn(
        "font-display font-semibold tracking-tight",
        size === "lg" ? "text-3xl sm:text-4xl" : "text-sm",
      )}
    >
      <span className={inverted ? "text-teal-300" : "text-teal-600"}>Hawk</span>
      <span className={inverted ? "text-amber-300" : "text-amber-600"}>Nexa</span>
    </p>
  );
}

export function BrandMark({
  variant = "lockup",
  inverted = false,
  className,
  subtitle,
}: BrandMarkProps) {
  const isFull = variant === "full";

  return (
    <div
      className={cn(
        "flex",
        isFull ? "flex-col items-center text-center gap-3" : "flex-row items-center gap-2.5",
        className,
      )}
    >
      <HawkIcon size={isFull ? 72 : 32} inverted={inverted} priority={isFull} />
      <div className={cn("flex flex-col", isFull ? "items-center" : "items-start min-w-0")}>
        <Wordmark inverted={inverted} size={isFull ? "lg" : "sm"} />
        {subtitle ? (
          <p
            className={cn(
              isFull ? "mt-1.5 text-sm" : "text-xs",
              inverted ? "text-slate-400" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
