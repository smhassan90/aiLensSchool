"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { platformService } from "@/services/platform.service";
import { assetUrl } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

export default function TeacherAiTrailPage() {
  const params = useParams<{ schoolId: string; teacherId: string }>();
  const query = useQuery({
    queryKey: ["platform-teacher-trail", params.schoolId, params.teacherId],
    queryFn: () => platformService.getTeacherLessonTrail(params.schoolId, params.teacherId),
  });

  if (query.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-destructive">Teacher not found.</p>
      </div>
    );
  }

  const { teacher, lessons, aiRequests } = query.data;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={teacher.name}
        description={`${teacher.employeeCode} · lesson uploads, OCR, and AI outputs`}
        actions={
          <Link href={`/super-admin/ai-usage/${params.schoolId}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Teachers
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
        {lessons.map((lesson) => (
          <article key={lesson.id} className="rounded-lg border bg-card p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">
                {formatDate(lesson.date)} · {lesson.classLabel} · {lesson.subjectName}
              </h2>
              <Badge variant="outline">{lesson.status}</Badge>
            </div>
            {(lesson.chapterName || lesson.topicName) && (
              <p className="mb-3 text-sm text-muted-foreground">
                {[lesson.chapterName, lesson.topicName].filter(Boolean).join(" — ")}
              </p>
            )}

            {lesson.pageImages.length > 0 ? (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Uploaded pages
                </p>
                <div className="flex flex-wrap gap-3">
                  {lesson.pageImages.map((img) => (
                    <a
                      key={img.sourceId}
                      href={assetUrl(img.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetUrl(img.url)}
                        alt={img.filename}
                        className="h-28 w-auto max-w-[10rem] object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mb-3 text-sm text-muted-foreground">
                No stored page images (older lessons before photo archival).
              </p>
            )}

            {lesson.rawOcrText ? (
              <details className="mb-3">
                <summary className="cursor-pointer text-sm font-medium">OCR / pipeline text</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                  {lesson.rawOcrText}
                </pre>
              </details>
            ) : null}

            {lesson.aiGeneratedText ? (
              <details className="mb-3">
                <summary className="cursor-pointer text-sm font-medium">AI lesson text</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                  {lesson.aiGeneratedText}
                </pre>
              </details>
            ) : null}

            {lesson.concepts.length > 0 ? (
              <ul className="mb-3 list-disc pl-5 text-sm text-muted-foreground">
                {lesson.concepts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}

            {lesson.homework.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Generated homework
                </p>
                {lesson.homework.map((hw) => (
                  <details key={hw.id} className="mb-2 rounded-md border p-3">
                    <summary className="cursor-pointer font-medium">{hw.title}</summary>
                    {hw.description ? (
                      <pre className="mt-2 whitespace-pre-wrap text-xs">{hw.description}</pre>
                    ) : null}
                  </details>
                ))}
              </div>
            ) : null}
          </article>
        ))}

        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lessons recorded for this teacher.</p>
        ) : null}

        <section className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 font-semibold">Recent AI requests</h3>
          <ul className="space-y-2 text-sm">
            {aiRequests.slice(0, 30).map((req) => (
              <li key={req.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0">
                <span>
                  {req.type} · {req.provider}/{req.model}
                </span>
                <span className="font-mono text-muted-foreground">
                  {(req.inputTokens + req.outputTokens).toLocaleString()} tok ·{" "}
                  {new Date(req.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
