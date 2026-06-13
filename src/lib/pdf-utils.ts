/**
 * PDF Utilities — Extract the first page of a PDF as a canvas image.
 *
 * Uses pdfjs-dist to render PDF pages to an offscreen canvas,
 * which can then be fed into the OCR engine.
 *
 * NOTE: pdfjs-dist uses browser-only APIs (DOMMatrix, etc.)
 * so it must be imported dynamically to avoid SSR errors.
 */

/**
 * Load a PDF from a File object and render its first 2 pages (if available) 
 * vertically appended onto a single data URL.
 *
 * @param file - The PDF file to process
 * @param scale - Render scale (higher = better quality but slower). Default 2.0
 * @returns Data URL of the rendered pages combined vertically
 */
export async function extractPagesFromPDF(
  file: File,
  scale: number = 2.0
): Promise<string> {
  // Dynamic import — only runs in the browser, avoids SSR DOMMatrix error
  const pdfjsLib = await import("pdfjs-dist");

  // Use the local worker file (copied from node_modules to public/)
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Load PDF document
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = Math.min(pdf.numPages, 2); // Extract up to 2 pages

  // Fetch the pages
  const pages = [];
  let totalHeight = 0;
  let maxWidth = 0;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    totalHeight += viewport.height;
    if (viewport.width > maxWidth) {
      maxWidth = viewport.width;
    }
    pages.push({ page, viewport });
  }

  // Create offscreen canvas large enough for both pages
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = maxWidth;
  canvas.height = totalHeight;

  // Fill background with white
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let currentY = 0;

  // Render each page
  for (const { page, viewport } of pages) {
    // Create a temporary canvas for this page to avoid rendering offset issues in pdf.js
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = viewport.width;
    pageCanvas.height = viewport.height;
    const pageCtx = pageCanvas.getContext("2d")!;

    await page.render({
      canvasContext: pageCtx,
      viewport,
    } as any).promise;

    // Draw the rendered page onto the main canvas
    ctx.drawImage(pageCanvas, 0, currentY);
    currentY += viewport.height;
  }

  // Return as data URL
  return canvas.toDataURL("image/png");
}

/**
 * Check if a file is a PDF.
 */
export function isPDF(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}
