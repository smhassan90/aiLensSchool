"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { platformService } from "@/services/platform.service";
import { ApiClientError } from "@/lib/api-client";

type SqlResult = Awaited<ReturnType<typeof platformService.runSql>>["results"][number];

export default function DatabasePage() {
  const [sql, setSql] = useState("");
  const [results, setResults] = useState<SqlResult[]>([]);
  const [error, setError] = useState("");

  const run = useMutation({
    mutationFn: () => platformService.runSql(sql),
    onSuccess: (data) => {
      setResults(data.results);
      setError("");
    },
    onError: (err) => {
      setResults([]);
      setError(err instanceof ApiClientError ? err.message : "The query failed");
    },
  });

  function submit() {
    const text = sql.trim();
    if (!text) {
      setError("Enter a SQL statement");
      return;
    }
    const changesData = !/^\s*(select|show|describe|desc|explain|with)\b/i.test(text);
    if (changesData && !window.confirm("This runs on the live database, including ALTER. Continue?")) return;
    run.mutate();
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Database"
        description="Run SQL on the live database. ALTER, CREATE, and other statements are allowed."
      />

      <div className="max-w-5xl space-y-4">
        <Textarea
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="min-h-[240px] font-mono text-xs"
          placeholder="ALTER TABLE ..."
        />
        <Button type="button" onClick={submit} disabled={run.isPending}>
          {run.isPending ? "Running…" : "Run SQL"}
        </Button>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {results.map((result, index) => (
          <section key={`${result.kind}-${index}`} className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">
              {result.kind === "execute" ? "Statement completed" : `${result.rowCount} row${result.rowCount === 1 ? "" : "s"}`}
              <span className="ml-2 font-normal text-muted-foreground">{result.elapsedMs} ms</span>
            </p>
            {result.kind === "execute" && (
              <p className="mt-1 text-sm text-muted-foreground">Rows affected: {result.rowCount}</p>
            )}
            {result.kind === "rows" && result.columns.length > 0 && (
              <div className="mt-3 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      {result.columns.map((column) => (
                        <th key={column} className="border-b px-2 py-1 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {result.columns.map((column) => (
                          <td key={column} className="border-b px-2 py-1 align-top">
                            {formatCell(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
