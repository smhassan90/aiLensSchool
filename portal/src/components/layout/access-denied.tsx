"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AccessDenied({
  title = "You do not have access to this page",
  description = "Ask your school admin to grant the right permissions for your role.",
  backHref = "/school/dashboard",
  backLabel = "Back to dashboard",
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <p className="font-display text-lg text-slate-900">{title}</p>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <Link href={backHref} className="mt-6 inline-block">
          <Button variant="outline">{backLabel}</Button>
        </Link>
      </div>
    </div>
  );
}
