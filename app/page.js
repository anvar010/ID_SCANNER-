"use client";

import { useEffect, useRef, useState } from "react";
import { parseIdDocument } from "./mrz";

const initialFields = {
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


export default function Page() {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const [fields, setFields] = useState(initialFields);
  const [rawMrz, setRawMrz] = useState("");
  const [rawOcr, setRawOcr] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line
  }, []);

  function setField(key, val) {
    setFields((f) => ({ ...f, [key]: val }));
  }

  async function pdfToImageBlobs(file) {
    const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    // Load the worker from a CDN matching the installed version
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const blobs = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      blobs.push(blob);
    }
    return blobs;
  }

  async function preprocess(source) {
    // Load to an image
    const url = source instanceof Blob ? URL.createObjectURL(source) : source;
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    // Upscale so MRZ chars are big (target ~1800px wide)
    const targetW = Math.max(1200, Math.min(2400, img.naturalWidth * 2));
    const scale = targetW / img.naturalWidth;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    // Grayscale + contrast stretch + binarize
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    // First pass: grayscale & find min/max
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      d[i] = d[i + 1] = d[i + 2] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    // Second pass: stretch + soft threshold
    for (let i = 0; i < d.length; i += 4) {
      let g = ((d[i] - min) * 255) / range;
      // Boost contrast around midtones
      g = g < 110 ? Math.max(0, g - 30) : Math.min(255, g + 30);
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(imgData, 0, 0);
    return new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
  }

  async function ocrText(source) {
    const prepared = await preprocess(source);
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status) setStatus(`${m.status}…`);
        if (typeof m.progress === "number") setProgress(Math.round(m.progress * 100));
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

  function applyParsed(parsed, ocrSourceText) {
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

  async function runOcr(source, opts = {}) {
    setBusy(true);
    setError("");
    setStatus("Preparing image…");
    setProgress(0);
    try {
      const text = await ocrText(source);
      const parsed = parseIdDocument(text);
      applyParsed(parsed, text);
      const looksLikeMrz =
        !!parsed.idNumber ||
        (parsed.rawMrz && parsed.rawMrz.includes("<<"));
      if (!looksLikeMrz) {
        if (!opts.returnsSuccess) {
          setError("Couldn't detect the MRZ. Try a sharper, well-lit image of the back of the card.");
        }
        return false;
      }
      setStatus("Done.");
      return true;
    } catch (e) {
      console.error(e);
      setError(e?.message || "OCR failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onFileChosen(e) {
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
        const pageTexts = [];
        let mrzPageText = null;
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
            if (normalized.some((l) => l.length >= 24 && l.includes("<<"))) {
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
        const parsed = parseIdDocument(mrzPageText, combined);
        applyParsed(parsed, combined);
        // Show the page where MRZ was found
        setPreviewUrl(URL.createObjectURL(pageBlobs[mrzPageIndex]));
        setStatus("Done.");
      } catch (err) {
        setBusy(false);
        setError(err?.message || "Failed to read PDF.");
      }
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStatus("Image selected.");
    runOcr(file);
  }

  async function openCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not available on this device/browser.");
      return;
    }
    try {
      setCameraOpen(true);
      setStatus("Position the MRZ zone (back of Emirates ID, or passport photo page) inside the frame and tap Capture.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          advanced: [
            { focusMode: "continuous" },
            { exposureMode: "continuous" },
            { whiteBalanceMode: "continuous" },
          ],
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setCameraOpen(false);
      setError("Camera permission denied or unavailable.");
    }
  }

  function stopCamera() {
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  // Crop a captured blob to the same region the on-screen guide rectangle
  // shows: horizontally 6%-94%, vertically 58%-80%.
  async function cropToGuide(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => {
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
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;

    // Prefer ImageCapture.takePhoto() — full sensor resolution, not a
    // downscaled video frame. Falls back to drawing the video frame.
    try {
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (track && typeof window !== "undefined" && "ImageCapture" in window) {
        const ic = new window.ImageCapture(track);
        const raw = await ic.takePhoto();
        const cropped = await cropToGuide(raw);
        const url = URL.createObjectURL(cropped);
        setPreviewUrl(url);
        stopCamera();
        await runOcr(cropped);
        return;
      }
    } catch (e) {
      // fall through to frame capture
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setError("Camera not ready yet.");
      return;
    }
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const cropped = await cropToGuide(blob);
        const url = URL.createObjectURL(cropped);
        setPreviewUrl(url);
        stopCamera();
        runOcr(cropped);
      },
      "image/jpeg",
      0.98,
    );
  }

  return (
    <div className="container">
      <h1>ID & Passport Scanner</h1>
      <p className="subtitle">
        Upload an image or PDF, or scan the MRZ zone of an <strong>Emirates ID</strong> (back) or a <strong>Passport</strong> (photo page). The document type is detected automatically.
      </p>

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
          <button className="btn btn-primary" onClick={openCamera} disabled={busy || cameraOpen}>
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
              <video ref={videoRef} className="video" playsInline muted />
              <div className="camera-guide" aria-hidden="true">
                <div className="side-l" />
                <div className="side-r" />
                <div className="frame" />
                <div className="frame-label">Align MRZ inside the box</div>
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={capture}>Capture</button>
              <button className="btn btn-danger" onClick={stopCamera}>Cancel</button>
            </div>
            <p className="tip">
              <strong>Tips for accurate OCR:</strong>
              <br />• Hold the phone <strong>directly above</strong> the card (not at an angle).
              <br />• <strong>Fill the frame</strong> — the MRZ text at the bottom should be as large as possible.
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
            <div className="progress"><div style={{ width: `${progress}%` }} /></div>
          </>
        )}
        {!busy && status && <p className="status">{status}</p>}
        {error && <p className="status error">{error}</p>}
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Extracted details</h2>
        {fields.docType && (
          <p className="subtitle" style={{ margin: "0 0 12px" }}>
            Detected: <strong>{fields.docType === "PASSPORT" ? "Passport" : "Emirates ID"}</strong>
          </p>
        )}

        {fields.docType === "PASSPORT" ? (
          <>
            <div className="field">
              <label>Passport Number</label>
              <input value={fields.passportNumber} onChange={(e) => setField("passportNumber", e.target.value)} />
            </div>
            <div className="field">
              <label>Issuing Country</label>
              <input value={fields.issuingCountry} onChange={(e) => setField("issuingCountry", e.target.value)} />
            </div>
          </>
        ) : (
          <div className="field">
            <label>ID Number</label>
            <input value={fields.idNumber} onChange={(e) => setField("idNumber", e.target.value)} placeholder="784-YYYY-XXXXXXX-X" />
          </div>
        )}
        <div className="field">
          <label>Full Name</label>
          <input
            value={fields.fullName}
            onChange={(e) => setField("fullName", e.target.value)}
            placeholder={fields.docType === "PASSPORT" ? "Name Surname" : "First Family Last"}
          />
        </div>
        {fields.docType !== "PASSPORT" && (
          <>
            <div className="field">
              <label>First Name</label>
              <input value={fields.firstName} onChange={(e) => setField("firstName", e.target.value)} />
            </div>
            <div className="field">
              <label>Family Name (MRZ Surname)</label>
              <input value={fields.surname} onChange={(e) => setField("surname", e.target.value)} />
            </div>
            <div className="field">
              <label>Last Name</label>
              <input value={fields.lastName} onChange={(e) => setField("lastName", e.target.value)} />
            </div>
          </>
        )}
        <div className="field">
          <label>Nationality</label>
          <input value={fields.nationality} onChange={(e) => setField("nationality", e.target.value)} />
        </div>
        <div className="field">
          <label>Sex</label>
          <input value={fields.sex} onChange={(e) => setField("sex", e.target.value)} />
        </div>
        <div className="field">
          <label>Date of Birth</label>
          <input value={fields.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} placeholder="YYYY-MM-DD" />
        </div>
        <div className="field">
          <label>Date of Expiry</label>
          <input value={fields.dateOfExpiry} onChange={(e) => setField("dateOfExpiry", e.target.value)} placeholder="YYYY-MM-DD" />
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
