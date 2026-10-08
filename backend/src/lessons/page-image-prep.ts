import { Logger } from '@nestjs/common';

const logger = new Logger('LessonPageImagePrep');

export type PreparedLessonPagePhoto = {
  buffer: Buffer;
  mimeType: string;
  originalname: string;
  size: number;
};

async function getSharp() {
  const sharpModule = await import('sharp');
  return (sharpModule as unknown as { default?: (i: Buffer) => import('sharp').Sharp }).default
    ? (sharpModule as unknown as { default: (i: Buffer) => import('sharp').Sharp }).default
    : (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
}

async function uprightPageBuffer(
  file: Pick<Express.Multer.File, 'buffer'>,
): Promise<{ working: Buffer; width: number; height: number }> {
  const sharpFn = await getSharp();
  const oriented = await sharpFn(file.buffer).rotate().toBuffer({ resolveWithObject: true });
  let working = oriented.data;
  let width = oriented.info.width;
  let height = oriented.info.height;

  // Phone photos often arrive landscape while the book page is portrait.
  if (width > height * 1.08) {
    const turned = await sharpFn(working).rotate(90).toBuffer({ resolveWithObject: true });
    working = turned.data;
    width = turned.info.width;
    height = turned.info.height;
  }
  return { working, width, height };
}

/**
 * Color upright page for AI vision — keep red titles and illustrations intact.
 * Greyscale OCR prep often makes vision stop at headings and skip poem lines.
 */
export async function prepareLessonPagePhotoForVision(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname' | 'size'>,
): Promise<PreparedLessonPagePhoto> {
  const originalname = file.originalname ?? 'page.jpg';
  try {
    const sharpFn = await getSharp();
    const { working, width, height } = await uprightPageBuffer(file);
    const maxEdge = 2000;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
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
  } catch (error) {
    logger.warn(
      `Vision image prep failed, using original: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      buffer: file.buffer,
      mimeType: file.mimetype || 'image/jpeg',
      originalname,
      size: file.size ?? file.buffer.length,
    };
  }
}

/**
 * Upright textbook photo: EXIF orientation, portrait correction, greyscale cleanup for OCR.
 */
export async function prepareLessonPagePhoto(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname' | 'size'>,
): Promise<PreparedLessonPagePhoto> {
  const originalname = file.originalname ?? 'page.jpg';
  try {
    const sharpFn = await getSharp();
    const { working, width, height } = await uprightPageBuffer(file);

    // Tinted/parchment pages and red headings: greyscale + contrast helps Tesseract.
    let pipeline = sharpFn(working)
      .greyscale()
      .normalize()
      .gamma(1.08)
      .linear(1.22, -18)
      .sharpen({ sigma: 1.0 });

    try {
      const trimmed = await pipeline.clone().trim({ threshold: 18 }).toBuffer({ resolveWithObject: true });
      const areaBefore = width * height;
      const areaAfter = trimmed.info.width * trimmed.info.height;
      if (areaAfter >= areaBefore * 0.55) {
        pipeline = sharpFn(trimmed.data)
          .greyscale()
          .normalize()
          .gamma(1.08)
          .linear(1.22, -18)
          .sharpen({ sigma: 1.0 });
      }
    } catch {
      // trim skipped — uniform background or busy layout
    }

    const buffer = await pipeline
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    return {
      buffer,
      mimeType: 'image/jpeg',
      originalname: originalname.replace(/\.\w+$/i, '') + '.jpg',
      size: buffer.length,
    };
  } catch (error) {
    logger.warn(
      `Page image prep failed, using original: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      buffer: file.buffer,
      mimeType: file.mimetype || 'image/jpeg',
      originalname,
      size: file.size ?? file.buffer.length,
    };
  }
}
