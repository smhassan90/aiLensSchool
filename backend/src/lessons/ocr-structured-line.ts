/** Normalized OCR line/box in original image coordinates (when available). */

export type OcrEngineId = 'paddle' | 'tesseract';

export type OcrStructuredLine = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence?: number;
  engine: OcrEngineId;
  readingOrder?: number;
};

export type PageOcrStructuredInput = {
  paddle: string;
  tesseract: string;
  paddleLines?: OcrStructuredLine[];
  tesseractLines?: OcrStructuredLine[];
  imageWidth?: number;
  imageHeight?: number;
  subjectName?: string | null;
  pipelineVersion?: string;
};

export type PageOcrReconcileResult = {
  plainText: string;
  usedLayoutReconcile: boolean;
  warnings: string[];
};
