export type OcrEngineStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export type OcrUploadProgressSnapshot = {
  uploadId: string;
  lessonId: string;
  fileName?: string;
  pageLabel?: string;
  phase: string;
  message: string;
  paddle: OcrEngineStepStatus;
  tesseract: OcrEngineStepStatus;
  merge: OcrEngineStepStatus;
  updatedAt: number;
};

export function ocrStepLabel(status: OcrEngineStepStatus): string {
  switch (status) {
    case "running":
      return "In progress…";
    case "done":
      return "Done";
    case "skipped":
      return "Skipped";
    case "error":
      return "Failed";
    default:
      return "Waiting";
  }
}
