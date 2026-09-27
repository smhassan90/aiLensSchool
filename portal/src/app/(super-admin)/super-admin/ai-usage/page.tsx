"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { platformService } from "@/services/platform.service";
import { Sparkles } from "lucide-react";

function formatTokens(n: number) {
  return n.toLocaleString();
}

export default function AiUsagePage() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["platform-ai-schools"],
    queryFn: () => platformService.listSchoolAiUsage(),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="AI usage by school"
        description="Token consumption and drill-down to teachers, lesson photos, OCR, and generated homework."
      />

      <div className="rounded-lg border bg-card">
        {query.isLoading ? (
          <PageLoader variant="panel" />
        ) : query.isError ? (
          <p className="p-4 text-sm text-destructive">{(query.error as Error).message}</p>
        ) : !query.data?.length ? (
          <EmptyState icon={<Sparkles className="h-10 w-10" />} title="No schools" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">AI requests</TableHead>
                <TableHead className="text-right">Tokens (in + out)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/super-admin/ai-usage/${row.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link href={`/super-admin/ai-usage/${row.id}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>{row.code}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "ACTIVE" ? "success" : "secondary"}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{row.ai.requestCount}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatTokens(row.ai.totalTokens)}
                    <span className="block text-xs text-muted-foreground">
                      {formatTokens(row.ai.inputTokens)} in · {formatTokens(row.ai.outputTokens)} out
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
