"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/layout/page-loader";
import { teachersService, type TeacherCoaching } from "@/services/teachers.service";
import { ExpandableTeacherRow } from "@/components/teachers/teacher-expand-row";

export function TeacherProgressPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [briefs, setBriefs] = useState<Record<string, TeacherCoaching>>({});

  const board = useQuery({
    queryKey: ["teacher-scoreboard"],
    queryFn: () => teachersService.scoreboard(),
    enabled: open,
  });
  const teachers = board.data?.teachers ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((row) => row.teacher.name.toLowerCase().includes(q));
  }, [teachers, query]);

  const analyze = useMutation({
    mutationFn: (id: string) => teachersService.coach(id),
    onSuccess: (result) => {
      setBriefs((prev) => ({ ...prev, [result.performance.teacher.id]: result.coaching }));
    },
  });

  return (
    <Card className="mt-8 overflow-hidden border-teal-200">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Teacher progress</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Strongest at the top. Tap a name to open the score mix, then ask AI what to discuss tonight.
          </p>
        </div>
        <Button onClick={() => setOpen((value) => !value)}>
          <Sparkles className="h-4 w-4" />
          {open ? "Hide ranking" : "AI teacher progress"}
        </Button>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-4">
          {board.isLoading ? (
            <PageLoader variant="panel" phrases={["Ranking teachers"]} />
          ) : (
            <>
              <Input
                placeholder="Find a teacher by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {filtered.length ? (
                <ol className="space-y-3">
                  {filtered.map((row, index) => (
                    <ExpandableTeacherRow
                      key={row.teacher.id}
                      row={row}
                      index={index}
                      totalTeachers={filtered.length}
                      expanded={expandedId === row.teacher.id}
                      weights={board.data?.weights ?? []}
                      coaching={briefs[row.teacher.id]}
                      aiPending={analyze.isPending && analyze.variables === row.teacher.id}
                      onToggle={() =>
                        setExpandedId((current) => (current === row.teacher.id ? "" : row.teacher.id))
                      }
                      onAskAi={() => {
                        setExpandedId(row.teacher.id);
                        analyze.mutate(row.teacher.id);
                      }}
                    />
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No teacher matches that name.</p>
              )}
              <p className="text-xs text-muted-foreground">
                AI looks at each course this teacher owns — term vs quiz results, missing lessons, classes that are not
                attempting work — not just the overall rank.
              </p>
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
