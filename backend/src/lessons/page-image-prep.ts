import { Logger } from '@nestjs/common';

const logger = new Logger('LessonPageImagePrep');

export type PreparedLessonPagePhoto = {
  buffer: Buffer;
  mimeType: string;
  originalname: string;
  size: number;
};

export type OrientedPagePhoto = {
  /** Greyscale / contrast-boosted buffer for Tesseract. */
  ocr: PreparedLessonPagePhoto;
  /** Color upright buffer for AI vision. */
  vision: PreparedLessonPagePhoto;
  width: number;
  height: number;
  rotationDegrees: number;
};

async function getSharp() {
  const sharpModule = await import('sharp');
  return (sharpModule as unknown as { default?: (i: Buffer) => import('sharp').Sharp }).default
    ? (sharpModule as unknown as { default: (i: Buffer) => import('sharp').Sharp }).default
    : (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
}

async function applyExifOrientation(
  file: Pick<Express.Multer.File, 'buffer'>,
): Promise<{ working: Buffer; width: number; height: number }> {
  const sharpFn = await getSharp();
  const oriented = await sharpFn(file.buffer).rotate().toBuffer({ resolveWithObject: true });
  return {
    working: oriented.data,
    width: oriented.info.width,
    height: oriented.info.height,
  };
}

async function rotateBuffer(
  working: Buffer,
  degrees: number,
): Promise<{ working: Buffer; width: number; height: number }> {
  if (!degrees) {
    const sharpFn = await getSharp();
    const meta = await sharpFn(working).metadata();
    return {
      working,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  }
  const sharpFn = await getSharp();
  const turned = await sharpFn(working).rotate(degrees).toBuffer({ resolveWithObject: true });
  return {
    working: turned.data,
    width: turned.info.width,
    height: turned.info.height,
  };
}

async function toOcrJpeg(
  working: Buffer,
  width: number,
  height: number,
  originalname: string,
): Promise<PreparedLessonPagePhoto> {
  const sharpFn = await getSharp();
  // Phone crops of textbook pages are often ~500–900px wide; engines miss the
  // washed-out top lines. Upscale so detection sees "In this chapter…" etc.
  const minEdge = Math.min(width, height) || 1;
  const targetMin = 1400;
  const scaleUp = minEdge < targetMin ? targetMin / minEdge : 1;
  const outW = Math.max(1, Math.round(width * scaleUp));
  const outH = Math.max(1, Math.round(height * scaleUp));

  let pipeline = sharpFn(working);
  if (scaleUp > 1.02) {
    pipeline = pipeline.resize({
      width: outW,
      height: outH,
      kernel: 'lanczos3',
      fit: 'fill',
    });
  }
  pipeline = pipeline
    .greyscale()
    .normalize()
    .gamma(1.05)
    .linear(1.15, -12)
    .sharpen({ sigma: 0.9 });

  try {
    const trimmed = await pipeline.clone().trim({ threshold: 18 }).toBuffer({ resolveWithObject: true });
    const areaBefore = Math.max(1, outW * outH);
    const areaAfter = trimmed.info.width * trimmed.info.height;
    if (areaAfter >= areaBefore * 0.55) {
      pipeline = sharpFn(trimmed.data)
        .greyscale()
        .normalize()
        .gamma(1.05)
        .linear(1.15, -12)
        .sharpen({ sigma: 0.9 });
    }
  } catch {
    // trim skipped
  }

  const buffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return {
    buffer,
    mimeType: 'image/jpeg',
    originalname: originalname.replace(/\.\w+$/i, '') + '.jpg',
    size: buffer.length,
  };
}

async function toVisionJpeg(
  working: Buffer,
  width: number,
  height: number,
  originalname: string,
): Promise<PreparedLessonPagePhoto> {
  const sharpFn = await getSharp();
  const maxEdge = 2000;
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  let pipeline = sharpFn(working);
  if (scale < 0.98) {
    pipeline = pipeline.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const buffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return {
    buffer,
    mimeType: 'image/jpeg',
    originalname: originalname.replace(/\.\w+$/i, '') + '.jpg',
    size: buffer.length,
  };
}

/**
 * Candidate rotations after EXIF.
 * Do NOT force landscape→portrait: many phone shots are landscape with readable
 * text, and a blind 90° turn makes Tesseract return mirrored junk.
 */
export function orientationCandidates(width: number, height: number): number[] {
  // Always try EXIF-upright first. Then try the other turns if needed by caller.
  if (width >= height) {
    return [0, 270, 90, 180];
  }
  return [0, 90, 270, 180];
}

export async function prepareOrientedVariant(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname' | 'size'>,
  rotationDegrees: number,
): Promise<OrientedPagePhoto> {
  const originalname = file.originalname ?? 'page.jpg';
  const base = await applyExifOrientation(file);
  const turned = await rotateBuffer(base.working, rotationDegrees);
  const [ocr, vision] = await Promise.all([
    toOcrJpeg(turned.working, turned.width, turned.height, originalname),
    toVisionJpeg(turned.working, turned.width, turned.height, originalname),
  ]);
  return {
    ocr,
    vision,
    width: turned.width,
    height: turned.height,
    rotationDegrees,
  };
}

/**
 * Color upright page for AI vision — keep red titles and illustrations intact.
 */
export async function prepareLessonPagePhotoForVision(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname' | 'size'>,
): Promise<PreparedLessonPagePhoto> {
  try {
    const variant = await prepareOrientedVariant(file, 0);
    return variant.vision;
  } catch (error) {
    logger.warn(
      `Vision image prep failed, using original: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      buffer: file.buffer,
      mimeType: file.mimetype || 'image/jpeg',
      originalname: file.originalname ?? 'page.jpg',
      size: file.size ?? file.buffer.length,
    };
  }
}

/**
 * Upright textbook photo: EXIF orientation + greyscale cleanup for OCR.
 * Does not force a 90° turn on landscape photos (that broke sideways phone shots).
 */
export async function prepareLessonPagePhoto(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname' | 'size'>,
): Promise<PreparedLessonPagePhoto> {
  try {
    const variant = await prepareOrientedVariant(file, 0);
    return variant.ocr;
  } catch (error) {
    logger.warn(
      `Page image prep failed, using original: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      buffer: file.buffer,
      mimeType: file.mimetype || 'image/jpeg',
      originalname: file.originalname ?? 'page.jpg',
      size: file.size ?? file.buffer.length,
    };
  }
}
