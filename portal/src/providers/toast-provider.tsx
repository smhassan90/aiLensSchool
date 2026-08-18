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
import { X } from "lucide-react";

type ToastVariant = "default" | "success" | "error";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { ...opts, id }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed inset-x-3 bottom-4 z-[100] flex max-w-sm flex-col gap-2 sm:inset-x-auto sm:right-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border bg-card p-4 shadow-lg animate-in slide-in-from-right",
              t.variant === "success" && "border-primary/30",
              t.variant === "error" && "border-destructive/30",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
