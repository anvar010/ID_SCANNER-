"use client";

import { useEffect, useRef, useState } from "react";
// mrz.js is plain JS; allowJs in tsconfig lets us import it directly.
import { parseIdDocument } from "./mrz";

type Fields = {
  docType: string;
  idNumber: string;
  passportNumber: string;
  issuingCountry: string;
  fullName: string;
  firstName: string;
  surname: string;
  lastName: string;
  givenNames: string;
  nationality: string;
  sex: string;
  dateOfBirth: string;
  dateOfExpiry: string;
};

const initialFields: Fields = {
  docType: "",
  idNumber: "",
  passportNumber: "",
  issuingCountry: "",
  fullName: "",
  firstName: "",
  surname: "",
  lastName: "",
  givenNames: "",
  nationality: "",
  sex: "",
  dateOfBirth: "",
  dateOfExpiry: "",
};

export default function EidScanner() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectWorkerRef = useRef<any>(null);
  const detectIntervalRef = useRef<any>(null);
  const detectingRef = useRef(false);

  const [fields, setFields] = useState<Fields>(initialFields);
  const [rawMrz, setRawMrz] = useState("");
  const [rawOcr, setRawOcr] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [mrzDetected, setMrzDetected] = useState(false);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key: keyof Fields, val: string) {
    setFields((f) => ({ ...f, [key]: val }));
  }

  async function pdfToImageBlobs(file: File): Promise<Blob[]> {
    const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const blobs: Blob[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/png"),
      );
      if (blob) blobs.push(blob);
    }
    return blobs;
  }

  async function preprocess(source: Blob | string): Promise<Blob> {
    const url =
      source instanceof Blob ? URL.createObjectURL(source) : source;
    const img: HTMLImageElement = await new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const targetW = Math.max(1200, Math.min(2400, img.naturalWidth * 2));
    const scale = targetW / img.naturalWidth;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      d[i] = d[i + 1] = d[i + 2] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < d.length; i += 4) {
      let g = ((d[i] - min) * 255) / range;
      g = g < 110 ? Math.max(0, g - 30) : Math.min(255, g + 30);
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(imgData, 0, 0);
    return new Promise((res) =>
      canvas.toBlob((b) => res(b as Blob), "image/png"),
    );
  }

  async function ocrText(source: Blob | string): Promise<string> {
    const prepared = await preprocess(source);
    const { createWorker, PSM }: any = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (m: any) => {
        if (m.status) setStatus(`${m.status}…`);
        if (typeof m.progress === "number")
          setProgress(Math.round(m.progress * 100));
      },
    });
    await worker.setParameters({
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<:/-. ",
      tessedit_pageseg_mode: PSM ? PSM.SINGLE_BLOCK : "6",
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(prepared);
    await worker.terminate();
    return data.text || "";
  }

  function applyParsed(parsed: any, ocrSourceText: string) {
    setRawOcr(ocrSourceText);
    setRawMrz(parsed.rawMrz);
    setFields({
      docType: parsed.docType || "",
      idNumber: parsed.idNumber || "",
      passportNumber: parsed.passportNumber || "",
      issuingCountry: parsed.issuingCountry || "",
      fullName: parsed.fullName || "",
      firstName: parsed.firstName || "",
      surname: parsed.surname || "",
      lastName: parsed.lastName || "",
      givenNames: parsed.givenNames || "",
      nationality: parsed.nationality || "",
      sex: parsed.sex || "",
      dateOfBirth: parsed.dateOfBirth || "",
      dateOfExpiry: parsed.dateOfExpiry || "",
    });
  }

  async function runOcr(
    source: Blob | string,
    opts: { returnsSuccess?: boolean } = {},
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    setStatus("Preparing image…");
    setProgress(0);
    try {
      const text = await ocrText(source);
      const parsed: any = parseIdDocument(text);
      applyParsed(parsed, text);
      const looksLikeMrz =
        !!parsed.idNumber ||
        (parsed.rawMrz && parsed.rawMrz.includes("<<"));
      if (!looksLikeMrz) {
        if (!opts.returnsSuccess) {
          setError(
            "Couldn't detect the MRZ. Try a sharper, well-lit image of the back of the card.",
          );
        }
        return false;
      }
      setStatus("Done.");
      return true;
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "OCR failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      try {
        setBusy(true);
        setStatus("Rendering PDF…");
        setProgress(0);
        const pageBlobs = await pdfToImageBlobs(file);
        if (pageBlobs.length === 0) {
          setBusy(false);
          setError("No pages found in PDF.");
          return;
        }
        const pageTexts: string[] = [];
        let mrzPageText: string | null = null;
        let mrzPageIndex = -1;
        for (let i = 0; i < pageBlobs.length; i++) {
          const blob = pageBlobs[i];
          setPreviewUrl(URL.createObjectURL(blob));
          setStatus(`Scanning PDF page ${i + 1} of ${pageBlobs.length}…`);
          // eslint-disable-next-line no-await-in-loop
          const text = await ocrText(blob);
          pageTexts.push(text);
          if (!mrzPageText) {
            const normalized = text
              .split(/\r?\n/)
              .map((s) => s.toUpperCase().replace(/[^A-Z0-9<]/g, ""));
            if (
              normalized.some((l) => l.length >= 24 && l.includes("<<"))
            ) {
              mrzPageText = text;
              mrzPageIndex = i;
            }
          }
        }
        setBusy(false);
        if (!mrzPageText) {
          setError("MRZ not detected on any PDF page.");
          return;
        }
        const combined = pageTexts.join("\n");
        const parsed: any = parseIdDocument(mrzPageText, combined);
        applyParsed(parsed, combined);
        setPreviewUrl(URL.createObjectURL(pageBlobs[mrzPageIndex]));
        setStatus("Done.");
      } catch (err: any) {
        setBusy(false);
        setError(err?.message || "Failed to read PDF.");
      }
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStatus("Image selected.");
    try {
      const cropped = await cropToGuide(file);
      await runOcrWithFullContext(cropped, file);
    } catch {
      await runOcr(file);
    }
  }

  async function openCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not available on this device/browser.");
      return;
    }
    try {
      setCameraOpen(true);
      setStatus(
        "Position the MRZ zone (back of Emirates ID, or passport photo page) inside the frame and tap Capture.",
      );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          advanced: [
            { focusMode: "continuous" } as any,
            { exposureMode: "continuous" } as any,
            { whiteBalanceMode: "continuous" } as any,
          ],
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      startMrzDetectionLoop();
    } catch (e) {
      setCameraOpen(false);
      setError("Camera permission denied or unavailable.");
    }
  }

  function stopCamera() {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
    if (detectWorkerRef.current) {
      try {
        detectWorkerRef.current.terminate();
      } catch { }
      detectWorkerRef.current = null;
    }
    detectingRef.current = false;
    setMrzDetected(false);
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  async function ensureDetectWorker() {
    if (detectWorkerRef.current) return detectWorkerRef.current;
    const { createWorker, PSM }: any = await import("tesseract.js");
    const worker = await createWorker("eng", 1);
    await worker.setParameters({
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      tessedit_pageseg_mode: PSM ? PSM.SINGLE_BLOCK : "6",
      preserve_interword_spaces: "1",
    });
    detectWorkerRef.current = worker;
    return worker;
  }

  function startMrzDetectionLoop() {
    if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
    detectIntervalRef.current = setInterval(() => {
      quickDetectMrzFromVideo();
    }, 1500);
  }

  async function quickDetectMrzFromVideo() {
    if (detectingRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    detectingRef.current = true;
    try {
      const wrap = video.parentElement as HTMLElement | null;
      const vis = wrap
        ? computeVisibleVideoRect(video, wrap)
        : { x: 0, y: 0, w: video.videoWidth, h: video.videoHeight };
      const sx = Math.round(vis.x + vis.w * 0.06);
      const sw = Math.round(vis.w * 0.88);
      const sy = Math.round(vis.y + vis.h * 0.58);
      const sh = Math.round(vis.h * 0.22);
      const targetW = 1000;
      const scale = Math.min(1, targetW / sw);
      const cw = Math.max(1, Math.round(sw * scale));
      const ch = Math.max(1, Math.round(sh * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/png"),
      );
      if (!blob) return;
      const worker = await ensureDetectWorker();
      if (!streamRef.current) return;
      const { data } = await worker.recognize(blob);
      const text = (data?.text || "").toUpperCase();
      const norm = text
        .split(/\r?\n/)
        .map((s: string) => s.replace(/[^A-Z0-9<]/g, ""));
      const longLines = norm.filter((l: string) => l.length >= 24);
      const hasMrz =
        longLines.some((l: string) => l.includes("<<")) ||
        longLines.length >= 2;
      setMrzDetected(hasMrz);
    } catch {
      // best-effort
    } finally {
      detectingRef.current = false;
    }
  }

  async function cropToGuide(blob: Blob): Promise<Blob> {
    const url = URL.createObjectURL(blob);
    try {
      const img: HTMLImageElement = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const sx = Math.round(img.naturalWidth * 0.06);
      const sw = Math.round(img.naturalWidth * 0.88);
      const sy = Math.round(img.naturalHeight * 0.58);
      const sh = Math.round(img.naturalHeight * 0.22);
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return await new Promise((res) =>
        canvas.toBlob((b) => res(b as Blob), "image/png"),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function hasMrzShape(text: string): boolean {
    const norm = text
      .split(/\r?\n/)
      .map((s) => s.toUpperCase().replace(/[^A-Z0-9<]/g, ""));
    return norm.some((l) => l.length >= 24 && l.includes("<<"));
  }

  async function runOcrWithFullContext(
    mrzSource: Blob,
    fullSource: Blob,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    setStatus("Preparing image…");
    setProgress(0);
    try {
      setStatus("Scanning MRZ region…");
      const mrzText = await ocrText(mrzSource);
      setStatus("Scanning full image for name fields…");
      const fullText = await ocrText(fullSource);
      const combined = `${fullText}\n${mrzText}`;
      const mrzSourceText = hasMrzShape(mrzText)
        ? mrzText
        : hasMrzShape(fullText)
          ? fullText
          : mrzText;
      const parsed: any = parseIdDocument(mrzSourceText, combined);
      applyParsed(parsed, combined);
      const looksLikeMrz =
        !!parsed.idNumber ||
        (parsed.rawMrz && parsed.rawMrz.includes("<<"));
      if (!looksLikeMrz) {
        setError(
          "Couldn't detect the MRZ. Try a sharper, well-lit image of the back of the card.",
        );
        return false;
      }
      setStatus("Done.");
      return true;
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "OCR failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function computeVisibleVideoRect(
    video: HTMLVideoElement,
    wrap: HTMLElement,
  ) {
    const Vw = video.videoWidth;
    const Vh = video.videoHeight;
    const rect = wrap.getBoundingClientRect();
    const Wd = rect.width;
    const Hd = rect.height;
    const videoAspect = Vw / Vh;
    const wrapAspect = Wd / Hd;
    if (wrapAspect > videoAspect) {
      const visW = Vw;
      const visH = Vw / wrapAspect;
      return { x: 0, y: (Vh - visH) / 2, w: visW, h: visH };
    }
    const visH = Vh;
    const visW = Vh * wrapAspect;
    return { x: (Vw - visW) / 2, y: 0, w: visW, h: visH };
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    const Vw = video.videoWidth;
    const Vh = video.videoHeight;
    if (!Vw || !Vh) {
      setError("Camera not ready yet.");
      return;
    }
    const wrap = video.parentElement as HTMLElement | null;
    const vis = wrap
      ? computeVisibleVideoRect(video, wrap)
      : { x: 0, y: 0, w: Vw, h: Vh };

    const visCanvas = canvasRef.current || document.createElement("canvas");
    visCanvas.width = Math.round(vis.w);
    visCanvas.height = Math.round(vis.h);
    const visCtx = visCanvas.getContext("2d")!;
    visCtx.drawImage(video, vis.x, vis.y, vis.w, vis.h, 0, 0, vis.w, vis.h);
    const visBlob: Blob | null = await new Promise((res) =>
      visCanvas.toBlob((b) => res(b), "image/jpeg", 0.98),
    );
    if (!visBlob) {
      setError("Capture failed. Please try again.");
      return;
    }

    const guideX = vis.w * 0.06;
    const guideY = vis.h * 0.58;
    const guideW = vis.w * 0.88;
    const guideH = vis.h * 0.22;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.round(guideW);
    cropCanvas.height = Math.round(guideH);
    const cropCtx = cropCanvas.getContext("2d")!;
    cropCtx.drawImage(
      visCanvas,
      guideX,
      guideY,
      guideW,
      guideH,
      0,
      0,
      guideW,
      guideH,
    );
    const cropBlob: Blob | null = await new Promise((res) =>
      cropCanvas.toBlob((b) => res(b as Blob), "image/png"),
    );
    if (!cropBlob) {
      setError("Capture failed. Please try again.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(visBlob));
    stopCamera();
    await runOcrWithFullContext(cropBlob, visBlob);
  }

  return (
    <div className="container">
      <header className="page-header">
        <div className="page-header-icon" aria-hidden="true">
          ID
        </div>
        <div>
          <h1>ID &amp; Passport Scanner</h1>
          <p className="subtitle">
            Upload an image or PDF, or scan the MRZ zone of an{" "}
            <strong>Emirates ID</strong> (back) or a{" "}
            <strong>Passport</strong> (photo page). The document type is
            detected automatically.
          </p>
        </div>
      </header>

      <div className="card">
        <div className="btn-row">
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.value = "";
              fileInputRef.current?.click();
            }}
            disabled={busy}
          >
            Choose file
          </button>
          <button
            className="btn btn-primary"
            onClick={openCamera}
            disabled={busy || cameraOpen}
          >
            Scan with camera
          </button>
          {(previewUrl || rawMrz) && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setFields(initialFields);
                setRawMrz("");
                setRawOcr("");
                setPreviewUrl("");
                setStatus("");
                setError("");
                setProgress(0);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              disabled={busy}
            >
              Reset
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          onChange={onFileChosen}
        />

        {cameraOpen && (
          <div style={{ marginTop: 12 }}>
            <div className="camera-wrap">
              <video
                ref={videoRef}
                className="video"
                playsInline
                muted
              />
              <div className="camera-guide" aria-hidden="true">
                <div className="side-l" />
                <div className="side-r" />
                <div className={`frame${mrzDetected ? " detected" : ""}`} />
                <div
                  className={`frame-label${mrzDetected ? " detected" : ""}`}
                >
                  {mrzDetected
                    ? "MRZ detected — tap Capture"
                    : "Align MRZ inside the box"}
                </div>
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={capture}>
                Capture
              </button>
              <button className="btn btn-danger" onClick={stopCamera}>
                Cancel
              </button>
            </div>
            <p className="tip">
              <strong>Tips for accurate OCR:</strong>
              <br />• Hold the card <strong>horizontally (landscape)</strong>{" "}
              so it fills the frame.
              <br />• Hold the phone <strong>directly above</strong> the
              card (not at an angle).
              <br />• <strong>Fill the frame</strong> — the MRZ text at the
              bottom should be as large as possible.
              <br />• Good even lighting, no glare or shadows on the MRZ.
              <br />• Wait for the camera to focus before tapping Capture.
            </p>
          </div>
        )}

        {previewUrl && !cameraOpen && (
          <img src={previewUrl} alt="preview" className="preview" />
        )}

        {busy && (
          <>
            <p className="status">{status}</p>
            <div className="progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          </>
        )}
        {!busy && status && <p className="status">{status}</p>}
        {error && <p className="status error">{error}</p>}
      </div>

      <div className="card">
        <h2 className="section-title">Extracted details</h2>
        {fields.docType && (
          <p className="detected-pill">
            Detected:{" "}
            <strong>
              {fields.docType === "PASSPORT" ? "Passport" : "Emirates ID"}
            </strong>
          </p>
        )}

        {fields.docType === "PASSPORT" ? (
          <>
            <div className="field">
              <label>Passport Number</label>
              <input
                value={fields.passportNumber}
                onChange={(e) =>
                  setField("passportNumber", e.target.value)
                }
              />
            </div>
            <div className="field">
              <label>Issuing Country</label>
              <input
                value={fields.issuingCountry}
                onChange={(e) =>
                  setField("issuingCountry", e.target.value)
                }
              />
            </div>
          </>
        ) : (
          <div className="field">
            <label>ID Number</label>
            <input
              value={fields.idNumber}
              onChange={(e) => setField("idNumber", e.target.value)}
              placeholder="784-YYYY-XXXXXXX-X"
            />
          </div>
        )}
        <div className="field">
          <label>Full Name</label>
          <input
            value={fields.fullName}
            onChange={(e) => setField("fullName", e.target.value)}
            placeholder={
              fields.docType === "PASSPORT"
                ? "Name Surname"
                : "First Family Last"
            }
          />
        </div>
        <div className="field">
          <label>Nationality</label>
          <input
            value={fields.nationality}
            onChange={(e) => setField("nationality", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Sex</label>
          <input
            value={fields.sex}
            onChange={(e) => setField("sex", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Date of Birth</label>
          <input
            value={fields.dateOfBirth}
            onChange={(e) => setField("dateOfBirth", e.target.value)}
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div className="field">
          <label>Date of Expiry</label>
          <input
            value={fields.dateOfExpiry}
            onChange={(e) => setField("dateOfExpiry", e.target.value)}
            placeholder="YYYY-MM-DD"
          />
        </div>

        {rawMrz && (
          <details style={{ marginTop: 8 }}>
            <summary>Show detected MRZ</summary>
            <pre className="raw">{rawMrz}</pre>
          </details>
        )}
        {rawOcr && (
          <details style={{ marginTop: 8 }}>
            <summary>Show raw OCR output</summary>
            <pre className="raw">{rawOcr}</pre>
          </details>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
