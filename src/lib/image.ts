const MAX_SIDE = 1600;
const QUALITY = 0.8;
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/** Resizes to ≤1600px and re-encodes as JPEG (typically 150–400 KB). Uses the browser's own decoder — no library. */
export async function compressImage(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Only image files are supported');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image is larger than 30 MB');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('This image format could not be read'); });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs → white, not black, in JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('Could not compress image');
  // Keep the original if it was already smaller (e.g. small optimised JPEGs).
  return file.size < blob.size && file.type === 'image/jpeg' && scale === 1 ? { blob: file, width, height } : { blob, width, height };
}
