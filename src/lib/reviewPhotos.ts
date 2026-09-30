export const MAX_REVIEW_PHOTOS = 5;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_PHOTO_MESSAGE = "Use JPG, PNG or WebP photos up to 5 MB each.";

export function validateReviewPhoto(file: { type: string; size: number }): string | null {
  return TYPES.has(file.type) && file.size <= MAX_BYTES ? null : REVIEW_PHOTO_MESSAGE;
}

export function fitWithin(width: number, height: number, max = 1600): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Browser only: decode, shrink to max px on the long side, re-encode as JPEG 0.85. */
export async function resizeToJpeg(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85)
  );
}

export function reviewPhotoPath(uid: string, appointmentId: string, id: string): string {
  return `${uid}/${appointmentId}/${id}.jpg`;
}
