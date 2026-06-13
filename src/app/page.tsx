"use client";

/**
 * EID Scanner — Main Page
 *
 * Orchestrates the full OCR document scanning flow:
 * Upload/Camera → OCR Processing → MRZ Parsing → Form Auto-fill
 */

import React, { useState, useCallback } from "react";
import {
  ScanLine,
  Camera,
  Shield,
  Sparkles,
  RotateCcw,
  AlertCircle,
  FileImage,
  Upload
} from "lucide-react";

import UploadButton from "@/components/upload-button";
import CameraScanner from "@/components/camera-scanner";
import DocumentForm from "@/components/document-form";
import PatientConsentForm, { type PatientData } from "@/components/patient-consent-form";

import { recognizeImage, preprocessImage } from "@/lib/ocr-engine";
import {
  parseMRZ,
  parseFrontIDName,
  parseFrontIDNumber,
  type MRZResult,
} from "@/lib/mrz-parser";
import { extractPagesFromPDF, isPDF } from "@/lib/pdf-utils";

// ─── Types ───────────────────────────────────────────────────────────

type ProcessingState = "idle" | "uploading" | "processing" | "done" | "error";

// ─── Component ───────────────────────────────────────────────────────

export default function Home() {
  // State
  const [scanStep, setScanStep] = useState<"front" | "back">("front");
  const [frontName, setFrontName] = useState<string | null>(null);
  const [formData, setFormData] = useState<MRZResult | null>(null);

  const [patientData, setPatientData] = useState<PatientData>({
    email: "",
    mobile: "",
    bloodPressure: "",
    pulse: "",
    allergies: "",
    medicalHistory: "",
    treatment: "",
    amount: "",
    paymentMode: "",
    dateTime: "",
    registeredNurse: "",
    cr: "",
    howDidYouKnow: "",
    signature: null,
  });

  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [rawOcrText, setRawOcrText] = useState<string | null>(null);
  const [showRawOcr, setShowRawOcr] = useState(true);

  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [cameraActive, setCameraActive] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState<"idle" | "camera" | "upload">("idle");
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  // ─── Core processing pipeline ──────────────────────────────────────

  const processImage = useCallback(async (imageDataUrl: string, step: "front" | "back" | "both") => {
    setProcessingState("processing");
    setOcrProgress(0);
    setErrorMessage(null);
    setRawOcrText(null);

    try {
      if (step === "front") {
        const rawText = await recognizeImage(imageDataUrl, (progress) => {
          setOcrProgress(progress.progress);
        });
        setRawOcrText(rawText);

        const extractedName = parseFrontIDName(rawText);

        if (extractedName) {
          setFrontName(extractedName);
        }

        setProcessingState("idle");
      } else if (step === "back") {
        const img = new Image();
        img.src = imageDataUrl;

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load image"));
        });

        const preprocessed = preprocessImage(img);

        // Try preprocessed image first
        const rawText = await recognizeImage(preprocessed, (progress) => {
          setOcrProgress(progress.progress);
        });

        console.log("[SCAN] Raw OCR text (preprocessed):", rawText);
        let result = parseMRZ(rawText);
        console.log("[SCAN] Parse result (preprocessed):", result);

        // If preprocessed didn't work, try original image
        let rawTextOriginal = "";
        if (!result) {
          rawTextOriginal = await recognizeImage(imageDataUrl, (progress) => {
            setOcrProgress(progress.progress);
          });
          console.log("[SCAN] Raw OCR text (original):", rawTextOriginal);
          result = parseMRZ(rawTextOriginal);
          console.log("[SCAN] Parse result (original):", result);
          // Show combined raw text for debugging
          setRawOcrText(rawText + "\n\n--- Original (no preprocessing) ---\n\n" + rawTextOriginal);
        } else {
          setRawOcrText(rawText);
        }

        if (result) {
          if (frontName && result.format !== "TD3") {
            result.fullName = frontName;
          }
          const extractedId = parseFrontIDNumber(rawTextOriginal || rawText);
          if (extractedId) {
            result.idNumber = extractedId;
          }
          setFormData(result);
          setProcessingState("done");

          if (!frontName && result.format === "TD1") {
            setErrorMessage("Could not read document front clearly. Please verify your name and enter details manually.");
          }
        } else {
          // Even if parser fails, don't clear existing form — just show error
          setProcessingState("error");
          setErrorMessage(
            "Could not read document clearly. Please enter details manually."
          );
        }
      } else if (step === "both") {
        const img = new Image();
        img.src = imageDataUrl;

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load image"));
        });

        const preprocessed = preprocessImage(img);

        const rawText = await recognizeImage(preprocessed, (progress) => {
          setOcrProgress(progress.progress);
        });

        const extractedName = parseFrontIDName(rawText);
        if (extractedName) {
          setFrontName(extractedName);
        }

        let result = parseMRZ(rawText);

        let rawTextOriginal = "";
        if (!result) {
          rawTextOriginal = await recognizeImage(imageDataUrl, (progress) => {
            setOcrProgress(progress.progress);
          });
          result = parseMRZ(rawTextOriginal);
          setRawOcrText(rawText + "\n\n--- Original (no preprocessing) ---\n\n" + rawTextOriginal);
        } else {
          setRawOcrText(rawText);
        }

        if (result) {
          if (extractedName && result.format !== "TD3") result.fullName = extractedName;

          const extractedId = parseFrontIDNumber(rawTextOriginal || rawText);
          if (extractedId) {
            result.idNumber = extractedId;
          }

          setFormData(result);
          setProcessingState("done");

          if (!extractedName && result.format === "TD1") {
            setErrorMessage("Could not read document front clearly. Please verify your name and enter details manually.");
          }
        } else {
          if (extractedName) {
            // No MRZ but got name (probably front side only of Emirates ID)
            setFormData({
              fullName: extractedName,
              dateOfBirth: "",
              sex: "Unknown",
              expiryDate: "",
              rawMRZ: "",
              format: "Unknown"
            });
            setProcessingState("done"); // got name but no mrz
          } else {
            setProcessingState("error");
          }
          setErrorMessage("Could not read document clearly. Please enter details manually.");
        }
      }
    } catch (err) {
      console.error("Processing error:", err);
      setProcessingState("error");
      setErrorMessage("An error occurred while processing the document. Please try again.");
    }
  }, [frontName]);

  // ─── Handlers ──────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    setSelectionMode("idle");
    setScanStep("front");
    setFrontName(null);
    setFormData(null);
    setFrontImage(null);
    setBackImage(null);
    setRawOcrText(null);
    setProcessingState("idle");
    setErrorMessage(null);
    setCameraActive(false);
  }, []);

  const handleFileSelected = useCallback(
    async (file: File, step: "front" | "back" | "both") => {
      setShowUploadModal(false);
      setSelectionMode("upload");
      setProcessingState("uploading");
      setErrorMessage(null);

      let imageDataUrl: string;

      try {
        if (isPDF(file)) {
          imageDataUrl = await extractPagesFromPDF(file);
        } else {
          imageDataUrl = await new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  reject(new Error("Could not get canvas context"));
                  return;
                }
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL("image/png");
                URL.revokeObjectURL(img.src);
                resolve(dataUrl);
              } catch (e) {
                reject(e);
              }
            };
            img.onerror = () => {
              URL.revokeObjectURL(img.src);
              reject(new Error("Failed to load image"));
            };
            img.src = URL.createObjectURL(file);
          });
        }
      } catch (err) {
        console.error("File reading error:", err);
        setProcessingState("error");
        setErrorMessage(
          isPDF(file)
            ? "Failed to read the PDF file. Please ensure it's a valid PDF."
            : "Failed to read the image file. Please try a different file."
        );
        return;
      }

      if (step === "front") setFrontImage(imageDataUrl);
      else if (step === "back") setBackImage(imageDataUrl);
      else if (step === "both") {
        setFrontImage(imageDataUrl);
        setBackImage(imageDataUrl);
      }

      await processImage(imageDataUrl, step);
    },
    [processImage]
  );

  const handleCameraCapture = useCallback(
    async (imageDataUrl: string) => {
      if (scanStep === "front") setFrontImage(imageDataUrl);
      else if (scanStep === "back") setBackImage(imageDataUrl);
      setCameraActive(false);
      await processImage(imageDataUrl, scanStep);
    },
    [processImage, scanStep]
  );

  const handleFormChange = useCallback(
    (field: keyof MRZResult, value: string) => {
      setFormData((prev) => {
        if (!prev) {
          return {
            fullName: "",
            dateOfBirth: "",
            sex: "Unknown" as const,
            expiryDate: "",
            rawMRZ: "",
            format: "Unknown" as const,
            [field]: value,
          };
        }
        return { ...prev, [field]: value };
      });
    },
    []
  );

  const handlePatientDataChange = useCallback(
    (field: keyof PatientData, value: string | null) => {
      setPatientData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleReset = useCallback(() => {
    setProcessingState("idle");
    setScanStep("front");
    setSelectionMode("idle");
    setFrontName(null);
    setFormData(null);
    setPatientData({
      email: "",
      mobile: "",
      bloodPressure: "",
      pulse: "",
      allergies: "",
      medicalHistory: "",
      treatment: "",
      amount: "",
      paymentMode: "",
      dateTime: "",
      registeredNurse: "",
      cr: "",
      howDidYouKnow: "",
      signature: null,
    });
    setFrontImage(null);
    setBackImage(null);
    setRawOcrText(null);
    setOcrProgress(0);
    setErrorMessage(null);
  }, []);

  const isProcessing = processingState === "uploading" || processingState === "processing";

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Validate extracted ID fields
    const requiredIdFields: { field: keyof MRZResult; label: string }[] = [
      { field: "fullName", label: "Full Name" },
      { field: "dateOfBirth", label: "Date of Birth" },
      { field: "expiryDate", label: "Expiry Date" },
    ];

    const missingFields: string[] = [];
    for (const { field, label } of requiredIdFields) {
      const value = formData?.[field];
      if (!value || (typeof value === "string" && value.trim() === "")) {
        missingFields.push(label);
      }
    }
    if (!formData?.sex || formData.sex === "Unknown") {
      missingFields.push("Gender");
    }

    if (missingFields.length > 0) {
      setSubmitState("error");
      setSubmitMessage("Please fill in all the required details before submitting.");
      return;
    }

    setSubmitState("submitting");
    setSubmitMessage(null);

    try {
      const payload = new FormData();

      if (formData) {
        Object.entries(formData).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            payload.append(`id_${key}`, String(value));
          }
        });
      }

      if (patientData) {
        Object.entries(patientData).forEach(([key, value]) => {
          // Send signature explicitly below without the 'patient_' prefix
          if (value !== undefined && value !== null && key !== "signature") {
            // Send 'cr' without prefix so backend receives it as just 'cr'
            const fieldName = key === "cr" ? "cr" : `patient_${key}`;
            payload.append(fieldName, String(value));
          }
        });
      }

      // Send images and signature as raw base64 data URLs
      if (frontImage) {
        payload.append("frontImage", frontImage);
      }
      if (backImage) {
        payload.append("backImage", backImage);
      }
      if (patientData.signature) {
        payload.append("signature", patientData.signature);
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error("API URL is not configured.");
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        body: payload,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${responseText}`);
      }

      setSubmitState("success");
      setSubmitMessage("Successfully submitted!");

      setTimeout(() => {
        handleReset();
        setSubmitState("idle");
      }, 3000);

    } catch (err: any) {
      setSubmitState("error");
      setSubmitMessage(err.message || "Failed to submit. Please try again.");
    }
  }, [formData, patientData, frontImage, backImage, handleReset]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <main className="flex-1 flex flex-col items-center justify-start px-4 py-8 sm:py-12 relative min-h-screen">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full animate-glow-pulse" />
        <div className="absolute -bottom-48 -right-48 w-[500px] h-[500px] bg-cyan-500/8 rounded-full animate-glow-pulse" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full space-y-6 animate-in fade-in zoom-in duration-200 shadow-2xl border border-black/10">
            <h2 className="text-xl font-bold text-gray-800 tracking-wide">Before you upload</h2>
            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
              <p>Add a PDF or image with both sides of your ID (front and back).</p>
              <p>For a passport, add the full front (photo) page.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex-1 py-3 bg-black/5 hover:bg-black/10 text-xs font-semibold rounded-xl transition-colors tracking-wide border border-black/10 text-gray-600"
              >
                Cancel
              </button>
              <div className="flex-1">
                <UploadButton
                  label="Choose file"
                  onFileSelected={(f) => handleFileSelected(f, "both")}
                  disabled={isProcessing}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-3xl mx-auto space-y-6">
        <header className="text-center space-y-4 pt-4 pb-6">
          <div className="flex justify-center mb-6">
            <img src="/ivblack.png" alt="Logo" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="text-xl sm:text-2xl font-serif text-[#1e3a5f] uppercase tracking-wide px-4">
            CONSENT AND AUTHORIZATION FOR INTRAVENOUS THERAPY PROCEDURES
          </h1>
          <p className="text-sm font-medium text-gray-500 tracking-wider">
            Multi Vitamin Mineral Therapy
          </p>
        </header>

        {/* Divider */}
        <div className="h-px w-full bg-gray-300/80 mb-8" />

        {/* ─── Menu / Cards ────────────────────────────────────── */}
        <div className="space-y-6">

          {(selectionMode === "idle" || selectionMode === "camera") && (
            <div className="glass-card p-4 sm:p-8">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-black uppercase tracking-wider mb-1">
                  EMIRATES ID / PASSPORT SCANNER
                </h2>
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-widest">
                  UPLOAD YOUR ID/PASSPORT TO FETCH DETAILS
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <button
                  onClick={() => setShowUploadModal(true)}
                  disabled={isProcessing}
                  className={`
                    flex items-center justify-center
                    w-full sm:w-auto px-6 py-3.5 rounded-lg border border-gray-300 bg-white
                    text-[13px] font-bold text-black uppercase tracking-widest
                    hover:bg-gray-50 transition-colors
                    ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  CHOOSE FILE
                </button>

                <button
                  onClick={() => setSelectionMode("camera")}
                  disabled={isProcessing || selectionMode === "camera"}
                  className={`
                    flex items-center justify-center
                    w-full sm:w-auto px-6 py-3.5 rounded-lg
                    text-[13px] font-bold uppercase tracking-widest
                    transition-colors
                    ${selectionMode === "camera"
                      ? "bg-gray-400 text-white cursor-default"
                      : "bg-black text-white hover:bg-gray-900"
                    }
                    ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  SCAN WITH CAMERA
                </button>
              </div>

              <div
                className={`grid transition-[grid-template-rows,opacity,margin] duration-500 ease-in-out ${selectionMode === "camera" ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"
                  }`}
              >
                <div className="overflow-hidden">
                  <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                    CAPTURE BOTH SIDES. <span className="font-bold text-gray-700">BACK</span> READS THE ID DETAILS; <span className="font-bold text-gray-700">FRONT</span> RECOVERS THE FULL PRINTED NAME.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* FRONT CARD */}
                    <div className="glass-card rounded-2xl p-4 flex flex-col h-full">
                      <span className="text-[11px] font-bold tracking-widest text-gray-500 uppercase mb-3">
                        FRONT SIDE
                      </span>
                      {frontName && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-500/10 px-2 py-1 rounded-md self-start mb-2 max-w-full break-words leading-tight">
                          {frontName}
                        </span>
                      )}
                      {frontImage ? (
                        <div className="flex-1 w-full flex items-center justify-center">
                          <img src={frontImage} alt="Front ID" className="w-full h-auto object-contain rounded-lg border border-black/80 shadow-sm" />
                        </div>
                      ) : (
                        <div className="flex-1 bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center relative min-h-[180px] border-2 border-dashed border-gray-200">
                          <span className="text-xs text-gray-400 tracking-widest font-medium">NO PHOTO</span>
                        </div>
                      )}
                      <div className="mt-4">
                        {frontImage ? (
                          <button
                            onClick={() => { setFrontImage(null); setFrontName(null); }}
                            disabled={isProcessing}
                            className="w-full py-3 bg-white hover:bg-gray-50 text-xs font-bold rounded-lg transition-colors tracking-widest border border-gray-300 text-black uppercase"
                          >
                            RETAKE FRONT
                          </button>
                        ) : (
                          <button
                            onClick={() => { setScanStep("front"); setCameraActive(true); }}
                            disabled={isProcessing}
                            className="w-full py-3 bg-white hover:bg-gray-50 text-xs font-bold rounded-lg transition-colors tracking-widest border border-gray-300 text-black uppercase"
                          >
                            CAPTURE FRONT
                          </button>
                        )}
                      </div>
                    </div>

                    {/* BACK CARD */}
                    <div className="glass-card rounded-2xl p-4 flex flex-col h-full">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">
                          BACKSIDE
                        </span>
                        {formData && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            Detected
                          </span>
                        )}
                      </div>
                      {backImage ? (
                        <div className="flex-1 w-full flex items-center justify-center">
                          <img src={backImage} alt="Back ID" className="w-full h-auto object-contain rounded-lg border border-black/80 shadow-sm" />
                        </div>
                      ) : (
                        <div className="flex-1 bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center relative min-h-[180px] border-2 border-dashed border-gray-200">
                          <span className="text-xs text-gray-400 tracking-widest font-medium">NO PHOTO</span>
                        </div>
                      )}
                      <div className="mt-4">
                        {backImage ? (
                          <button
                            onClick={() => { setBackImage(null); setFormData(null); }}
                            disabled={isProcessing}
                            className="w-full py-3 bg-white hover:bg-gray-50 text-xs font-bold rounded-lg transition-colors tracking-widest border border-gray-300 text-black uppercase"
                          >
                            RETAKE BACK
                          </button>
                        ) : (
                          <button
                            onClick={() => { setScanStep("back"); setCameraActive(true); }}
                            disabled={isProcessing}
                            className="w-full py-3 bg-white hover:bg-gray-50 text-xs font-bold rounded-lg transition-colors tracking-widest border border-gray-300 text-black uppercase"
                          >
                            CAPTURE BACK
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cancel Button */}
                  <div className="flex justify-center mt-6 mb-2">
                    <button
                      onClick={() => { setSelectionMode("idle"); setFrontImage(null); setBackImage(null); setFrontName(null); }}
                      className="px-8 py-3 rounded-lg bg-red-50 text-red-500 text-xs font-bold uppercase tracking-widest hover:bg-red-100 transition-colors"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectionMode === "upload" && (
            <div className="glass-card rounded-2xl p-4 border border-black/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">
                  Uploaded Document
                </span>
                {formData && (
                  <span className="text-[10px] text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                    Detected
                  </span>
                )}
              </div>
              {(frontImage || backImage) && (
                <div className="bg-black/[0.03] rounded-xl overflow-hidden flex items-center justify-center relative min-h-[200px] border border-black/5">
                  <img
                    src={frontImage || backImage || ""}
                    alt="Uploaded document"
                    className="w-auto h-auto max-w-full max-h-[280px] object-contain m-auto rounded-xl p-2"
                  />
                </div>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => setShowUploadModal(true)}
                  disabled={isProcessing}
                  className="w-full py-3 bg-white hover:bg-gray-50 text-xs font-bold rounded-lg transition-colors tracking-widest border border-gray-300 text-black uppercase"
                >
                  RE-UPLOAD DOCUMENT
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isProcessing}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-xs font-bold rounded-lg transition-colors tracking-widest border border-red-200 text-red-600 uppercase"
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>


        {/* ─── Progress Bar (during processing) ──────────────────── */}
        {isProcessing && (
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-600 animate-pulse" />
                <span className="text-xs text-gray-500 font-medium">
                  {processingState === "uploading"
                    ? "Reading document..."
                    : "Running OCR analysis..."}
                </span>
              </div>
              <span className="text-xs text-cyan-600 font-mono tabular-nums">
                {Math.round(ocrProgress * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300 ease-out"
                style={{ width: `${Math.max(ocrProgress * 100, 5)}%` }}
              />
            </div>
          </div>
        )}

        {/* ─── Error State ────────────────────────────────────────── */}
        {processingState === "error" && errorMessage && (
          <div className="glass-card rounded-2xl p-4 border-amber-500/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="space-y-2 flex-1">
                <p className="text-sm text-amber-700">{errorMessage}</p>
                <button
                  onClick={() => setProcessingState("idle")}
                  className="flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-700 transition-colors font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Forms Container ────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="w-full space-y-6">
          {/* ─── Document Form ──────────────────────────────────────── */}
          <div className="glass-card rounded-2xl p-4 sm:p-5 mt-4 min-w-0">
            <DocumentForm
              data={formData}
              isProcessing={isProcessing}
              onChange={handleFormChange}
            />
          </div>

          {/* ─── Patient & Consent Details Form ─────────────────────── */}
          <div className="glass-card rounded-2xl p-4 sm:p-5 mt-4 min-w-0">
            <PatientConsentForm
              data={patientData}
              onChange={handlePatientDataChange}
            />
          </div>

          {/* ─── Reset Button ───────────────────────────────────────── */}
          {(selectionMode === "camera" || selectionMode === "upload" || formData) && !isProcessing && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                id="scan-another-btn"
                onClick={handleReset}
                className="
                  flex items-center gap-2 px-5 py-2.5
                  rounded-xl border border-red-500/30 bg-red-500/10
                  text-xs font-medium text-red-600
                  hover:bg-red-500/20 hover:border-red-500/50
                  transition-all duration-200
                "
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear All Data & Start Over
              </button>
            </div>
          )}

          {/* ─── Submit Button ──────────────────────────────────────── */}
          <div className="w-full pb-8 !mt-2">
            {submitMessage && (
              <div className={`mb-3 text-sm text-center font-medium ${submitState === "error" ? "text-red-500" : "text-green-500"}`}>
                {submitMessage}
              </div>
            )}
            <button
              type="submit"
              disabled={submitState === "submitting"}
              className={`w-full px-8 py-4 rounded-xl text-white font-bold tracking-widest uppercase transition-all duration-200 shadow-lg text-sm
                ${submitState === "submitting" ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:bg-gray-900"}
              `}
            >
              {submitState === "submitting" ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>

      {/* ─── Camera Scanner Modal ───────────────────────────────── */}
      <CameraScanner
        isOpen={cameraActive}
        mode={scanStep}
        onCapture={handleCameraCapture}
        onClose={() => setCameraActive(false)}
      />
    </main>
  );
}
