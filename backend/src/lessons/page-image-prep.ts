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

/**
 * Upright textbook photo: EXIF orientation, portrait correction, light cleanup for OCR/vision.
 */
export async function prepareLessonPagePhoto(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname' | 'size'>,
): Promise<PreparedLessonPagePhoto> {
  const originalname = file.originalname ?? 'page.jpg';
  try {
    const sharpFn = await getSharp();
    let base = sharpFn(file.buffer).rotate();

    const oriented = await base.toBuffer({ resolveWithObject: true });
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

    let pipeline = sharpFn(working).normalize().sharpen({ sigma: 0.8 });

    try {
      const trimmed = await pipeline.clone().trim({ threshold: 18 }).toBuffer({ resolveWithObject: true });
      const areaBefore = width * height;
      const areaAfter = trimmed.info.width * trimmed.info.height;
      if (areaAfter >= areaBefore * 0.55) {
        pipeline = sharpFn(trimmed.data);
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
