"use client";

import { useEffect, useRef, useState } from "react";

type ApiFields = {
  docType: string;
  documentNumber: string;
  fullName: string;
  firstName: string;
  lastName: string;
  nationality: string;
  issuingCountry: string;
  sex: string;
  dateOfBirth: string;
  dateOfExpiry: string;
};

const initialFields: ApiFields = {
  docType: "",
  documentNumber: "",
  fullName: "",
  firstName: "",
  lastName: "",
  nationality: "",
  issuingCountry: "",
  sex: "",
  dateOfBirth: "",
  dateOfExpiry: "",
};

function unwrap(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    let best: { value: string; confidence: number } | null = null;
    for (const entry of v) {
      if (entry == null) continue;
      if (typeof entry === "string" && entry.trim()) {
        if (!best || best.confidence < 0)
          best = { value: entry.trim(), confidence: 0 };
      } else if (typeof entry === "object") {
        const val =
          typeof entry.value === "string"
            ? entry.value
            : entry.value != null
              ? String(entry.value)
              : "";
        const conf =
          typeof entry.confidence === "number" ? entry.confidence : 0;
        if (val && (!best || conf > best.confidence))
          best = { value: val.trim(), confidence: conf };
      }
    }
    return best?.value || "";
  }
  if (typeof v === "object") {
    if (typeof v.value === "string") return v.value.trim();
    if (v.value != null) return String(v.value);
  }
  return "";
}

function pick(obj: any, keys: string[]): string {
  for (const k of keys) {
    const out = unwrap(obj?.[k]);
    if (out) return out;
  }
  return "";
}

function mapResponseToFields(resp: any): {
  fields: ApiFields;
  raw: string;
  meta: { decision: string; transactionId: string };
} {
  const data = resp?.data || resp?.result || resp || {};
  const docType = pick(data, [
    "documentType",
    "documentName",
    "type",
    "document_type",
    "docType",
  ]);
  const fullName = pick(data, [
    "fullName",
    "name",
    "full_name",
    "documentHolder",
  ]);
  const firstName = pick(data, ["firstName", "givenName", "first_name"]);
  const lastName = pick(data, ["lastName", "surname", "last_name"]);
  const documentNumber = pick(data, [
    "documentNumber",
    "document_number",
    "idNumber",
    "passportNumber",
    "number",
  ]);
  const nationality = pick(data, [
    "nationalityFull",
    "nationality",
    "nationality_full",
  ]);
  const issuingCountry = pick(data, [
    "issuerOrgFull",
    "issuerOrg_full",
    "issuingCountry",
    "issuing_country",
    "issuerOrg",
    "country",
  ]);
  const sex = pick(data, ["sex", "gender"]);
  const dateOfBirth = pick(data, ["dob", "dateOfBirth", "date_of_birth"]);
  const dateOfExpiry = pick(data, [
    "expiry",
    "dateOfExpiry",
    "expirationDate",
    "expiration_date",
  ]);
  return {
    fields: {
      docType:
        docType ||
        (documentNumber?.startsWith("784") ? "EMIRATES_ID" : ""),
      documentNumber,
      fullName: fullName || [firstName, lastName].filter(Boolean).join(" "),
      firstName,
      lastName,
      nationality,
      issuingCountry,
      sex,
      dateOfBirth,
      dateOfExpiry,
    },
    raw: JSON.stringify(resp, null, 2),
    meta: {
      decision: typeof resp?.decision === "string" ? resp.decision : "",
      transactionId:
        typeof resp?.transactionId === "string" ? resp.transactionId : "",
    },
  };
}

type Side = "front" | "back";

export default function IdScannerWithApi() {
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [frontBlob, setFrontBlob] = useState<Blob | null>(null);
  const [backBlob, setBackBlob] = useState<Blob | null>(null);
  const [frontUrl, setFrontUrl] = useState("");
  const [backUrl, setBackUrl] = useState("");

  const [fields, setFields] = useState<ApiFields>(initialFields);
  const [decision, setDecision] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cameraSide, setCameraSide] = useState<Side | null>(null);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key: keyof ApiFields, val: string) {
    setFields((f) => ({ ...f, [key]: val }));
  }

  function setSideBlob(side: Side, blob: Blob) {
    const url = URL.createObjectURL(blob);
    if (side === "front") {
      setFrontBlob(blob);
      setFrontUrl(url);
    } else {
      setBackBlob(blob);
      setBackUrl(url);
    }
  }

  function clearAll() {
    setFrontBlob(null);
    setBackBlob(null);
    setFrontUrl("");
    setBackUrl("");
    setFields(initialFields);
    setRawJson("");
    setDecision("");
    setTransactionId("");
    setStatus("");
    setError("");
    if (frontInputRef.current) frontInputRef.current.value = "";
    if (backInputRef.current) backInputRef.current.value = "";
  }

  async function submitToApi() {
    if (!frontBlob && !backBlob) {
      setError("Please add the front and/or back of the card first.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Uploading to IDAnalyzer…");
    try {
      const form = new FormData();
      if (frontBlob) form.append("document", frontBlob, "front.jpg");
      else if (backBlob) form.append("document", backBlob, "back.jpg");
      if (frontBlob && backBlob)
        form.append("documentBack", backBlob, "back.jpg");
      const resp = await fetch("/api/idanalyzer", {
        method: "POST",
        body: form,
      });
      const json = await resp.json();
      if (!resp.ok) {
        const msg =
          (json && (json.error || json.body?.message || json.body?.error)) ||
          `HTTP ${resp.status}`;
        setError(typeof msg === "string" ? msg : JSON.stringify(msg));
        setRawJson(JSON.stringify(json, null, 2));
        setStatus("");
        return;
      }
      const { fields: mapped, raw, meta } = mapResponseToFields(json);
      setFields(mapped);
      setRawJson(raw);
      setDecision(meta.decision);
      setTransactionId(meta.transactionId);
      setStatus("Done.");
    } catch (e: any) {
      setError(e?.message || "Request failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function onFileChosen(
    side: Side,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setSideBlob(side, file);
    setStatus(`${side === "front" ? "Front" : "Back"} selected.`);
  }

  async function openCamera(side: Side) {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not available on this device/browser.");
      return;
    }
    try {
      setCameraSide(side);
      setStatus(
        `Fit the ${side === "front" ? "FRONT" : "BACK"} of the card inside the frame and tap Capture.`,
      );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraSide(null);
      setError("Camera permission denied or unavailable.");
    }
  }

  function stopCamera() {
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraSide(null);
  }

  async function capture() {
    const side = cameraSide;
    const video = videoRef.current;
    if (!video || !side) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setError("Camera not ready yet.");
      return;
    }
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.95),
    );
    if (!blob) {
      setError("Capture failed. Please try again.");
      return;
    }
    setSideBlob(side, blob);
    setStatus(`${side === "front" ? "Front" : "Back"} captured.`);
    stopCamera();
  }

  function SideSlot({ side }: { side: Side }) {
    const url = side === "front" ? frontUrl : backUrl;
    const inputRef = side === "front" ? frontInputRef : backInputRef;
    const label = side === "front" ? "Front of card" : "Back of card (MRZ)";
    return (
      <div
        style={{
          flex: 1,
          minWidth: 220,
          border: "1px dashed #c7d2fe",
          borderRadius: 12,
          padding: 12,
          background: "#fafbff",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#374151",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          {label}
        </div>
        {url ? (
          <img
            src={url}
            alt={`${side} preview`}
            style={{
              width: "100%",
              maxHeight: 160,
              objectFit: "contain",
              background: "#0f172a",
              borderRadius: 8,
              marginBottom: 8,
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: 120,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            No image yet
          </div>
        )}
        <div className="btn-row">
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              inputRef.current?.click();
            }}
            disabled={busy}
          >
            Choose file
          </button>
          <button
            className="btn btn-primary"
            onClick={() => openCamera(side)}
            disabled={busy || cameraSide !== null}
          >
            Camera
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFileChosen(side, e)}
        />
      </div>
    );
  }

  return (
    <div className="container">
      <header className="page-header">
        <div className="page-header-icon" aria-hidden="true">
          API
        </div>
        <div>
          <h1>ID Scanner (IDAnalyzer API)</h1>
          <p className="subtitle">
            Uses the IDAnalyzer Core API on the server. For best results,
            provide both the <strong>front</strong> (printed name) and the{" "}
            <strong>back</strong> (MRZ) of the card.{" "}
            <a href="/" style={{ color: "#1f6feb" }}>
              ← Back to Tesseract scanner
            </a>
          </p>
        </div>
      </header>

      <div className="card">
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <SideSlot side="front" />
          <SideSlot side="back" />
        </div>

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button
            className="btn btn-primary"
            onClick={submitToApi}
            disabled={busy || (!frontBlob && !backBlob)}
          >
            {busy ? "Scanning…" : "Scan with IDAnalyzer"}
          </button>
          {(frontBlob || backBlob || rawJson) && (
            <button
              className="btn btn-secondary"
              onClick={clearAll}
              disabled={busy}
            >
              Reset
            </button>
          )}
        </div>

        {cameraSide && (
          <div style={{ marginTop: 12 }}>
            <div className="camera-wrap">
              <video
                ref={videoRef}
                className="video"
                playsInline
                muted
              />
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={capture}>
                Capture {cameraSide === "front" ? "front" : "back"}
              </button>
              <button className="btn btn-danger" onClick={stopCamera}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {busy && <p className="status">{status}</p>}
        {!busy && status && <p className="status">{status}</p>}
        {error && <p className="status error">{error}</p>}
      </div>

      <div className="card">
        <h2 className="section-title">Extracted details</h2>
        {fields.docType && (
          <p className="detected-pill">
            Detected: <strong>{fields.docType}</strong>
          </p>
        )}
        {decision && (
          <p
            className="detected-pill"
            style={{
              marginLeft: 6,
              background:
                decision === "accept"
                  ? "#dcfce7"
                  : decision === "reject"
                    ? "#fee2e2"
                    : "#fef3c7",
              borderColor:
                decision === "accept"
                  ? "#86efac"
                  : decision === "reject"
                    ? "#fca5a5"
                    : "#fde68a",
            }}
          >
            Decision: <strong>{decision}</strong>
          </p>
        )}
        {transactionId && (
          <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 12px" }}>
            Transaction: {transactionId}
          </p>
        )}
        <div className="field">
          <label>Document Number</label>
          <input
            value={fields.documentNumber}
            onChange={(e) => setField("documentNumber", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Full Name</label>
          <input
            value={fields.fullName}
            onChange={(e) => setField("fullName", e.target.value)}
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
          <label>Issuing Country</label>
          <input
            value={fields.issuingCountry}
            onChange={(e) => setField("issuingCountry", e.target.value)}
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
          />
        </div>
        <div className="field">
          <label>Date of Expiry</label>
          <input
            value={fields.dateOfExpiry}
            onChange={(e) => setField("dateOfExpiry", e.target.value)}
          />
        </div>

        {rawJson && (
          <details style={{ marginTop: 8 }}>
            <summary>Show raw API response</summary>
            <pre className="raw">{rawJson}</pre>
          </details>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
