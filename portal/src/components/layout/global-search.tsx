"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { insightsService } from "@/services/insights.service";
import { Search } from "lucide-react";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const results = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => insightsService.search(debounced),
    enabled: debounced.length >= 2,
  });

  const hasHits =
    (results.data?.students.length ?? 0) +
      (results.data?.parents.length ?? 0) +
      (results.data?.teachers.length ?? 0) +
      (results.data?.classes.length ?? 0) >
    0;

  return (
    <div className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Student ID, parent phone or name"
        className="pl-9"
      />
      {open && debounced.length >= 2 && (
        <div className="absolute z-50 mt-2 max-h-96 w-full overflow-auto rounded-md border bg-card p-2 shadow-lg">
          {results.isLoading && <p className="px-2 py-3 text-sm text-muted-foreground">Searching…</p>}
          {results.isError && (
            <p className="px-2 py-3 text-sm text-destructive">Search failed. Try again.</p>
          )}
          {results.data && !hasHits && (
            <p className="px-2 py-3 text-sm text-muted-foreground">No matches for “{debounced}”.</p>
          )}
          {results.data?.students.map((item) => (
            <Link
              key={item.id}
              href={`/school/students/${item.id}`}
              className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="font-medium">{item.name}</span>
              <span className="ml-2 text-muted-foreground">
                {item.studentCode} · {item.className ?? "—"} {item.sectionName ?? ""}
              </span>
            </Link>
          ))}
          {results.data?.parents.map((item) => (
            <Link
              key={item.id}
              href={`/school/parents/${item.id}`}
              className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="font-medium">{item.name}</span>
              <span className="ml-2 text-muted-foreground">Parent · {item.phone ?? item.email}</span>
            </Link>
          ))}
          {results.data?.teachers.map((item) => (
            <Link
              key={item.id}
              href={`/school/teachers/${item.id}`}
              className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="font-medium">{item.name}</span>
              <span className="ml-2 text-muted-foreground">Teacher · {item.employeeCode}</span>
            </Link>
          ))}
          {results.data?.classes.map((item) => (
            <Link
              key={item.id}
              href={`/school/academics/grades/${item.id}/analytics`}
              className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="font-medium">{item.name}</span>
              <span className="ml-2 text-muted-foreground">Class progress</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
