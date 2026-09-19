import type { MediaPart } from "../core/provider.ts";
import { base64Bytes, IMAGE_LONG_EDGE, IMAGE_QUALITY } from "../core/mediaLimits.ts";

/**
 * Turning a phone photo into something worth sending.
 *
 * A modern phone camera produces a 4000px, four-megabyte JPEG. Sent as-is that
 * is slow, expensive in tokens, and no more readable than a 1536px one — print
 * text is legible well below the sensor's resolution. Downscaling happens here,
 * on the device, before anything leaves it.
 */

/** Roughly what a 1536px image costs, for the pre-flight estimate. */
const APPROX_TOKENS_PER_IMAGE = 1300;

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  // `createImageBitmap` honours EXIF orientation, which matters: a page
  // photographed in portrait and stored rotated would otherwise reach the model
  // sideways, and it transcribes what it sees.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function targetSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= IMAGE_LONG_EDGE) return { width, height };
  const scale = IMAGE_LONG_EDGE / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("could not read the image")), {
      once: true,
    });
    reader.addEventListener(
      "load",
      () => {
        const result = String(reader.result);
        // Strip the `data:image/jpeg;base64,` prefix; the wire format wants the
        // payload alone.
        resolve(result.slice(result.indexOf(",") + 1));
      },
      { once: true },
    );
    reader.readAsDataURL(blob);
  });
}

/** One photographed page, ready to send. */
export async function prepareImage(file: Blob): Promise<MediaPart> {
  const bitmap = await loadBitmap(file);
  const { width, height } = targetSize(bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d canvas context");
  // Better downscaling than the default: thin serif strokes survive it.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY),
  );
  if (!blob) throw new Error("could not encode the image");

  const data = await toBase64(blob);
  return {
    kind: "image",
    mimeType: "image/jpeg",
    data,
    approxTokens: APPROX_TOKENS_PER_IMAGE,
  };
}

export async function prepareImages(files: readonly Blob[]): Promise<MediaPart[]> {
  // Sequential rather than parallel: decoding several 12-megapixel JPEGs at
  // once is how a mid-range phone runs out of memory mid-import.
  const out: MediaPart[] = [];
  for (const file of files) out.push(await prepareImage(file));
  return out;
}

/** For the preview, so a parent sees the size before spending anything. */
export function totalBytes(parts: readonly MediaPart[]): number {
  return parts.reduce((sum, part) => sum + base64Bytes(part.data), 0);
}
