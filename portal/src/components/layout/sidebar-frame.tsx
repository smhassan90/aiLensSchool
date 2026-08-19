"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/brand-mark";

export function SidebarFrame({
  subtitle,
  children,
  userName,
  onLogout,
}: {
  subtitle: string;
  children: ReactNode;
  userName?: string;
  onLogout: () => void;
}) {
  const initials = (userName ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  return (
    <aside className="relative flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-[#071412] text-white print:hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_-10%,rgba(20,184,166,0.22),transparent_55%),radial-gradient(90%_60%_at_110%_100%,rgba(245,158,11,0.12),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/50 to-transparent" />

      <div className="relative shrink-0 border-b border-white/10 px-5 py-5">
        <BrandMark inverted subtitle={subtitle} />
      </div>

      <nav className="relative flex min-h-0 flex-1 flex-col justify-start gap-0.5 overflow-hidden px-3 py-3">
        {children}
      </nav>

      <div className="relative shrink-0 border-t border-white/10 p-3">
        <div className="mb-2.5 flex items-center gap-3 rounded-xl bg-white/5 px-2.5 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-teal-700 text-xs font-semibold text-white shadow-inner">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="text-[11px] text-white/45">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-2 py-1.5 text-[13px] font-medium tracking-wide transition-all duration-200",
        active
          ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          : "text-white/60 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1.5 h-[calc(100%-0.75rem)] w-0.5 rounded-full transition-opacity",
          active ? "bg-teal-300 opacity-100" : "opacity-0",
        )}
      />
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          active ? "bg-teal-400/20 text-teal-200" : "bg-white/5 text-white/70 group-hover:bg-white/10",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </Link>
  );
}
