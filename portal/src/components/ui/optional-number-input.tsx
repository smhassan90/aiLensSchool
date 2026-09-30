"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/** Number field that can be cleared while typing (no stuck leading zeros). */
export function OptionalNumberInput({
  id,
  value,
  onChange,
  min = 0,
  max = 200,
  disabled,
  className,
  allowDecimal = false,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  allowDecimal?: boolean;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (draft === null) return;
    const normalized = allowDecimal ? String(value) : String(Math.round(value));
    if (draft !== "" && draft !== normalized) return;
    if (draft === "" && value === 0) return;
    setDraft(null);
  }, [value, draft, allowDecimal]);

  const display = draft ?? (value === 0 ? "" : String(value));

  const commit = (raw: string) => {
    setDraft(null);
    if (raw === "" || raw === ".") {
      onChange(0);
      return;
    }
    const n = allowDecimal ? Number(raw) : parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      onChange(0);
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    onChange(allowDecimal ? Math.round(clamped * 100) / 100 : Math.round(clamped));
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
      value={display}
      onChange={(e) => {
        const next = e.target.value;
        if (allowDecimal) {
          if (next === "" || /^\d*\.?\d*$/.test(next)) setDraft(next);
          return;
        }
        if (next === "" || /^\d+$/.test(next)) setDraft(next);
      }}
      onBlur={() => {
        if (draft !== null) commit(draft);
      }}
    />
  );
}
