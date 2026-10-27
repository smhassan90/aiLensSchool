"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { timetablesService } from "@/services/timetables.service";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = ".csv,image/jpeg,image/png,image/webp";

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (name.endsWith(".csv") || mime === "text/csv" || mime === "text/plain") return true;
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return true;
  return false;
}

export function TimetableUploadCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const onUpload = async () => {
    if (!file) return;
    if (!isAllowedFile(file)) {
      toast({
        title: "Unsupported file",
        description: "Use CSV or a clear photo (JPEG, PNG, or WebP). XLSX and PDF are not supported.",
        variant: "error",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "File too large", description: "Maximum size is 15 MB.", variant: "error" });
      return;
    }
    setUploading(true);
    try {
      const result = await timetablesService.uploadImport(file);
      toast({ title: "Import created", variant: "success" });
      router.push(`/school/timetable/imports/${result.import.id}`);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload timetable</CardTitle>
        <CardDescription>
          Accepted formats: CSV spreadsheet export, or a photo (JPEG, PNG, WebP). Excel (.xlsx) and PDF
          are not supported yet — save as CSV or photograph the printed timetable.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="block w-full text-sm"
            disabled={uploading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} ({Math.round(file.size / 1024)} KB)
            </p>
          )}
        </div>
        <Button type="button" disabled={!file || uploading} onClick={() => void onUpload()}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </CardContent>
    </Card>
  );
}
