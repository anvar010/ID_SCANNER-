"use client";

/**
 * CameraScanner — Full-screen modal with live webcam feed for MRZ capture.
 *
 * Features:
 * - Live video stream (prefers rear camera)
 * - MRZ guide overlay with animated scanning line
 * - Capture and Close buttons
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera, X, Aperture, SwitchCamera, AlertCircle } from "lucide-react";

interface CameraScannerProps {
  isOpen: boolean;
  mode?: "front" | "back";
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
}

export default function CameraScanner({
  isOpen,
  mode = "back",
  onCapture,
  onClose,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Start camera stream
  const startCamera = useCallback(async () => {
    setError(null);
    setIsReady(false);

    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsReady(true);
        };
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setError(
        "Unable to access camera. Please ensure camera permissions are granted."
      );
    }
  }, [facingMode]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  // Start/stop camera when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Handle capture
  const handleCapture = () => {
    if (!videoRef.current || !isReady) return;

    const video = videoRef.current;
    const container = video.parentElement;
    if (!container) return;

    // Container dimensions
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Original video dimensions
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const videoRatio = videoWidth / videoHeight;
    const containerRatio = containerWidth / containerHeight;

    let renderWidth, renderHeight, offsetX, offsetY;

    // object-cover math
    if (containerRatio > videoRatio) {
      renderWidth = containerWidth;
      renderHeight = containerWidth / videoRatio;
      offsetX = 0;
      offsetY = (renderHeight - containerHeight) / 2;
    } else {
      renderHeight = containerHeight;
      renderWidth = containerHeight * videoRatio;
      offsetX = (renderWidth - containerWidth) / 2;
      offsetY = 0;
    }

    // Guide box percentages (matches the CSS in the UI)
    // Guide box percentages (matches the CSS in the UI)
    // We use the same full-card bounding box for both front and back now.
    const guideTop = 0.40;
    const guideBottom = 0.20;
    const guideLeft = 0.05;
    const guideRight = 0.05;

    // Guide box size in container space
    const boxX = containerWidth * guideLeft;
    const boxY = containerHeight * guideTop;
    const boxW = containerWidth * (1 - guideLeft - guideRight);
    const boxH = containerHeight * (1 - guideTop - guideBottom);

    // Map to original video pixels
    const scale = videoWidth / renderWidth;
    const cropX = (boxX + offsetX) * scale;
    const cropY = (boxY + offsetY) * scale;
    const cropW = boxW * scale;
    const cropH = boxH * scale;

    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;

    const ctx = canvas.getContext("2d")!;
    // Draw only the cropped portion
    ctx.drawImage(
      video,
      cropX, cropY, cropW, cropH,
      0, 0, cropW, cropH
    );

    // Use JPEG for better performance and smaller size
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    onCapture(dataUrl);
    onClose();
  };

  // Toggle front/back camera
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // Handle close
  const handleClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
      id="camera-scanner-modal"
    >
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full h-full flex flex-col">
        {/* Header bar */}
        <div className="relative z-10 flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-2 text-white/80">
            <Camera className="w-5 h-5 text-cyan-400" />
            <span className="text-sm font-medium tracking-wide">
              {mode === "front" ? "Scan Front of ID" : "Scan Back of ID"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="toggle-camera-btn"
              onClick={toggleCamera}
              className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white transition-all duration-200"
              title="Switch Camera"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>

            <button
              id="close-camera-btn"
              onClick={handleClose}
              className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm text-white/70 hover:bg-red-500/30 hover:text-red-300 transition-all duration-200"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video feed area */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="flex flex-col items-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-red-300 text-sm max-w-sm">{error}</p>
              <button
                onClick={startCamera}
                className="px-5 py-2.5 rounded-xl bg-blue-500/20 text-blue-300 text-sm font-medium hover:bg-blue-500/30 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Guide Overlay */}
              {isReady && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Dark overlay with transparent window */}
                  <div className="absolute inset-0">
                    <div className="absolute top-0 left-0 right-0 bottom-[60%] bg-black/50" />
                    <div className="absolute top-[80%] left-0 right-0 bottom-0 bg-black/50" />
                    <div className="absolute top-[40%] left-0 w-[5%] bottom-[20%] bg-black/50" />
                    <div className="absolute top-[40%] right-0 w-[5%] bottom-[20%] bg-black/50" />
                  </div>

                  {/* Guide Box */}
                  <div className="absolute left-[5%] right-[5%] top-[40%] bottom-[20%]">
                    {/* Corner brackets */}
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan-400 rounded-br-lg" />

                    {/* Animated scan line */}
                    <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80 animate-scan-line" />

                    {/* Guide text */}
                    <div className="absolute -top-8 left-0 right-0 text-center">
                      <span className="text-xs text-cyan-300/80 font-medium tracking-wider uppercase bg-black/40 px-3 py-1 rounded-full">
                        {mode === "front" ? "Align Front of ID here" : "Align Back of ID here"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading state */}
              {!isReady && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                    <span className="text-white/60 text-sm">Starting camera...</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Capture button bar */}
        <div className="relative z-10 flex items-center justify-center py-6 bg-gradient-to-t from-black/80 to-transparent">
          <button
            id="capture-photo-btn"
            onClick={handleCapture}
            disabled={!isReady}
            className={`
              group relative w-18 h-18 rounded-full
              transition-all duration-300
              ${
                isReady
                  ? "bg-white hover:bg-cyan-100 hover:scale-105 active:scale-95 shadow-lg shadow-white/20"
                  : "bg-white/20 cursor-not-allowed"
              }
            `}
          >
            <div className="absolute inset-1.5 rounded-full border-2 border-black/10 flex items-center justify-center">
              <Aperture
                className={`w-7 h-7 ${
                  isReady ? "text-gray-800" : "text-white/30"
                }`}
              />
            </div>
            {/* Pulse ring when ready */}
            {isReady && (
              <div className="absolute -inset-1 rounded-full border-2 border-white/30 animate-ping opacity-30" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
