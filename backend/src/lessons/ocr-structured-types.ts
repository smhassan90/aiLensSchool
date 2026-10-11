/**
 * Structured OCR payload for merge / review (replaces flat engine strings over time).
 * Workers should populate this; merge layer consumes regions in reading order.
 */

export type OcrRegionType =
  | 'heading'
  | 'paragraph'
  | 'exercise_panel'
  | 'exercise_cell'
  | 'math_expression'
  | 'table'
  | 'figure'
  | 'footer'
  | 'unknown';

export type OcrRecognitionCandidate = {
  text: string;
  confidence: number;
  engine: 'paddle' | 'tesseract' | 'math' | 'other';
  modelId?: string;
};

export type OcrFractionComponent = {
  role: 'numerator' | 'denominator' | 'whole' | 'operator' | 'bar';
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
};

export type OcrRegion = {
  id: string;
  type: OcrRegionType;
  readingOrder: number;
  bbox: [number, number, number, number];
  cellLabel?: string;
  language?: string;
  transcript: string;
  candidates: OcrRecognitionCandidate[];
  fractionParts?: OcrFractionComponent[];
  warnings: string[];
  needsReview: boolean;
};

export type OcrPageResult = {
  version: 1;
  imageWidth: number;
  imageHeight: number;
  preprocessing: string[];
  qualityWarnings: string[];
  regions: OcrRegion[];
  plainText: string;
};
