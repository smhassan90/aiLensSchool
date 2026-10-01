"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastVariant = "default" | "success" | "error" | "warning";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function toastDuration(variant: ToastVariant, override?: number) {
  if (override != null) return override;
  if (variant === "warning") return 9000;
  if (variant === "error") return 6000;
  return 4500;
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />;
  }
  if (variant === "error") {
    return <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />;
  }
  if (variant === "warning") {
    return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />;
  }
  return <Info className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { ...opts, id }]);
      setTimeout(() => dismiss(id), toastDuration(opts.variant, opts.durationMs));
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  const standardToasts = toasts.filter((t) => t.variant !== "warning");
  const warningToasts = toasts.filter((t) => t.variant === "warning");

  const renderToast = (t: Toast) => (
    <div
      key={t.id}
      role={t.variant === "error" || t.variant === "warning" ? "alert" : "status"}
      className={cn(
        "rounded-lg border p-4 shadow-lg animate-in slide-in-from-right",
        t.variant === "default" && "border-border bg-card",
        t.variant === "success" && "border-primary/30 bg-card",
        t.variant === "error" && "border-destructive/40 bg-card",
        t.variant === "warning" &&
          "border border-orange-300 border-l-[6px] border-l-orange-500 bg-white shadow-xl ring-1 ring-black/5 dark:border-orange-700 dark:border-l-orange-400 dark:bg-slate-900 dark:ring-white/10",
      )}
    >
      <div className="flex items-start gap-3">
        {t.variant === "warning" ? (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950"
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5 text-orange-700 dark:text-orange-300" />
          </span>
        ) : (
          <ToastIcon variant={t.variant} />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold leading-snug",
              t.variant === "warning" && "text-base font-bold text-slate-900 dark:text-white",
            )}
          >
            {t.title}
          </p>
          {t.description ? (
            <p
              className={cn(
                "mt-2 text-sm leading-relaxed",
                t.variant === "warning"
                  ? "whitespace-pre-line text-slate-700 dark:text-slate-200"
                  : "text-muted-foreground",
              )}
            >
              {t.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            "shrink-0 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10",
            t.variant === "warning" ? "text-slate-600 dark:text-slate-300" : "text-muted-foreground",
          )}
          aria-label={`Dismiss: ${t.title}`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {warningToasts.length > 0 ? (
        <div
          role="region"
          aria-label="Important notifications"
          className="fixed inset-x-3 top-4 z-[100] flex w-[min(100%,28rem)] flex-col gap-2 sm:inset-x-auto sm:right-4"
        >
          {warningToasts.map(renderToast)}
        </div>
      ) : null}
      {standardToasts.length > 0 ? (
        <div
          role="region"
          aria-label="Notifications"
          className="fixed inset-x-3 bottom-4 z-[100] flex max-w-sm flex-col gap-2 sm:inset-x-auto sm:right-4"
        >
          {standardToasts.map(renderToast)}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
