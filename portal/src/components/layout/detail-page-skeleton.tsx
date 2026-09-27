import { Skeleton } from "@/components/ui/skeleton";

/** Lightweight placeholder while a detail record loads (avoids heavy loader animation/assets). */
export function DetailPageSkeleton({ titleWidth = "14rem" }: { titleWidth?: string }) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 max-w-full" style={{ width: titleWidth }} />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-6 w-32" />
      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 p-6 space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
