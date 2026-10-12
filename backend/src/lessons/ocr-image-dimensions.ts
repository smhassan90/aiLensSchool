/** Pixel dimensions of an encoded image buffer (authoritative for OCR coordinates). */
export async function imageDimensionsFromBuffer(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  const sharpModule = await import('sharp');
  const sharp =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}
