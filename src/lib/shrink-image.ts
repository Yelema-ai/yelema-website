import { MAX_UPLOAD_BYTES } from "@/lib/upload-limit";

// A phone photo often weighs 5 to 12 MB, over what a browser may send (lib/upload-limit.ts): instead of
// refusing it, the browser re-encodes it smaller, as a JPEG, before the upload (Leslie, 30/10). Pictures
// only, and only when over the limit; anything the browser cannot decode (HEIC on most browsers) is
// returned as it was and refused as before. Browser only.

const PICTURE = /^image\/(jpeg|png|webp)$/;
const SIDES = [3200, 2560, 2048, 1600];

export async function shrinkPicture(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES || !PICTURE.test(file.type) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      // A transparent PNG keeps a white background once in JPEG, not a black one.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        const name = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
        return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
      }
    }
    return file;
  } finally {
    bitmap.close();
  }
}
