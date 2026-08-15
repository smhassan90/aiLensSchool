import { cn } from "@/lib/utils";

type BrandMarkProps = {
  variant?: "full" | "lockup";
  inverted?: boolean;
  className?: string;
  subtitle?: string;
};

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
      <span className={inverted ? "text-teal-300" : "text-teal-600"}>Ai</span>
      <span className={inverted ? "text-white" : "text-slate-800"}>School</span>
      <span className={inverted ? "text-amber-300" : "text-amber-600"}>Lens</span>
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
    <div className={cn("flex flex-col", isFull ? "items-center text-center" : "items-start", className)}>
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
  );
}
