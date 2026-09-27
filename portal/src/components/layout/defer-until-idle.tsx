"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Defers heavy UI until the browser is idle so hero content can paint first (mobile LCP). */
export function DeferUntilIdle({
  children,
  placeholder = null,
  timeoutMs = 2500,
}: {
  children: ReactNode;
  placeholder?: ReactNode;
  timeoutMs?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = () => setReady(true);
    const idleId = window.requestIdleCallback?.(run, { timeout: timeoutMs });
    if (idleId != null) {
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(run, 400);
    return () => window.clearTimeout(timer);
  }, [timeoutMs]);

  return ready ? children : placeholder;
}
