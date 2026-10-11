export type RegionPreprocessVariant = 'original' | 'grayscale' | 'upscale' | 'contrast';

export type PageCropBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

async function sharpFn() {
  const sharpModule = await import('sharp');
  return (
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp)
  );
}

/** Crop page buffer in pixel coordinates (rounded). */
export async function cropPageRegion(
  imageBuffer: Buffer,
  box: PageCropBox,
  variant: RegionPreprocessVariant,
): Promise<Buffer> {
  const sharp = await sharpFn();
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const left = Math.max(0, Math.min(w - 1, Math.floor(box.x0)));
  const top = Math.max(0, Math.min(h - 1, Math.floor(box.y0)));
  const width = Math.max(1, Math.min(w - left, Math.ceil(box.x1 - box.x0)));
  const height = Math.max(1, Math.min(h - top, Math.ceil(box.y1 - box.y0)));

  let pipe = sharp(imageBuffer).extract({ left, top, width, height });
  if (variant === 'grayscale') {
    pipe = pipe.grayscale();
  } else if (variant === 'contrast') {
    pipe = pipe.grayscale().normalize();
  } else if (variant === 'upscale') {
    pipe = pipe.resize({ width: width * 2, height: height * 2, kernel: 'lanczos3' }).sharpen();
  }
  return pipe.jpeg({ quality: 92 }).toBuffer();
}
