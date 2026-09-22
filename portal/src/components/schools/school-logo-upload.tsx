"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { assetUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type SchoolLogoUploadProps = {
  value?: string | null;
  file?: File | null;
  onFileChange: (file: File | null) => void;
  className?: string;
};

export function SchoolLogoUpload({ value, file, onFileChange, className }: SchoolLogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const displaySrc = preview ?? assetUrl(value);

  return (
    <div className={cn("space-y-2", className)}>
      <Label>School logo</Label>
      <p className="text-xs text-muted-foreground">Square image recommended (PNG or JPG).</p>
      <div className="flex items-center gap-4">
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-muted-foreground/40 bg-muted/30"
        >
          {displaySrc ? (
            <img src={displaySrc} alt="School logo preview" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-8 w-8 text-muted-foreground/50" />
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              onFileChange(next);
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {displaySrc ? "Change logo" : "Upload logo"}
          </Button>
          {displaySrc ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                onFileChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
