/**
 * OCR Engine — Wrapper around Tesseract.js v7
 *
 * Provides image-to-text extraction optimized for MRZ reading.
 * Uses dynamic import to avoid SSR issues.
 */

export type OCRProgress = {
  status: string;
  progress: number; // 0-1
};

/**
 * Pre-process an image for better MRZ recognition:
 * - Convert to grayscale
 * - Increase contrast
 * - Apply threshold to binarize
 *
 * Returns a canvas data URL.
 */
export function preprocessImage(imageSource: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // Get source dimensions
  let width: number, height: number;
  if (imageSource instanceof HTMLVideoElement) {
    width = imageSource.videoWidth;
    height = imageSource.videoHeight;
  } else if (imageSource instanceof HTMLImageElement) {
    width = imageSource.naturalWidth;
    height = imageSource.naturalHeight;
  } else {
    width = imageSource.width;
    height = imageSource.height;
  }

  canvas.width = width;
  canvas.height = height;

  // Draw the source image
  ctx.drawImage(imageSource, 0, 0, width, height);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Convert to grayscale and apply contrast enhancement
  for (let i = 0; i < data.length; i += 4) {
    // Grayscale using luminance formula
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    // Apply contrast stretch (increase contrast for MRZ text)
    const contrast = 1.8;
    const factor = (259 * (contrast * 128 + 255)) / (255 * (259 - contrast * 128));
    let enhanced = factor * (gray - 128) + 128;

    // Clamp to 0-255
    enhanced = Math.max(0, Math.min(255, enhanced));

    // Simple threshold for binarization (MRZ text is dark on light background)
    const threshold = 140;
    const binary = enhanced < threshold ? 0 : 255;

    data[i] = binary;
    data[i + 1] = binary;
    data[i + 2] = binary;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Run OCR on an image source and return extracted text.
 *
 * Tesseract.js v7 API:
 *   recognize(image, langs, options) — creates a worker, recognizes, terminates
 *
 * @param imageSource - Data URL, blob URL, or image element
 * @param onProgress - Optional progress callback
 * @returns Extracted raw text
 */
export async function recognizeImage(
  imageSource: string,
  onProgress?: (progress: OCRProgress) => void
): Promise<string> {
  // Dynamic import to avoid SSR issues (Tesseract needs browser APIs)
  const Tesseract = await import("tesseract.js");

  // Tesseract.js v7: recognize is a top-level convenience function
  // It creates a worker internally, runs OCR, and terminates
  const recognize = Tesseract.recognize || Tesseract.default?.recognize;

  if (!recognize) {
    throw new Error("Tesseract.js recognize function not found");
  }

  const result = await recognize(imageSource, "eng", {
    logger: (m: { status?: string; progress?: number }) => {
      if (onProgress && m.status && typeof m.progress === "number") {
        onProgress({
          status: m.status,
          progress: m.progress,
        });
      }
    },
  });

  return result.data.text;
}

/**
 * Capture a frame from a video element and return as data URL.
 */
export function captureVideoFrame(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0);

  return canvas.toDataURL("image/png");
}
