"use client";

/**
 * ScanResultPreview — Shows the uploaded/captured image and raw MRZ text.
 *
 * Features:
 * - Image thumbnail preview
 * - Collapsible raw MRZ text display
 * - Document format indicator
 * - Confidence / status badge
 */

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ImageIcon,
} from "lucide-react";
import type { MRZResult } from "@/lib/mrz-parser";

interface ScanResultPreviewProps {
  imageUrl: string | null;
  mrzResult: MRZResult | null;
  isProcessing: boolean;
}

export default function ScanResultPreview({
  imageUrl,
  mrzResult,
  isProcessing,
}: ScanResultPreviewProps) {
  const [showRawMRZ, setShowRawMRZ] = useState(false);

  if (!imageUrl && !isProcessing) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Image preview */}
      {imageUrl && (
        <div className="relative group">
          <div className="w-full max-h-[50vh] bg-black/40 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Scanned document"
              className="w-auto h-auto max-w-full max-h-[50vh] object-contain"
            />
          </div>

          {/* Processing overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-2 border-cyan-400/20 rounded-full" />
                  <div className="absolute inset-0 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <span className="text-cyan-300/80 text-sm font-medium animate-pulse">
                  Reading your document...
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status bar */}
      <div className="px-4 py-3 border-t border-white/5">
        {isProcessing ? (
          <div className="flex items-center gap-2 text-white/40">
            <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            <span className="text-xs">Reading your document...</span>
          </div>
        ) : mrzResult ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-emerald-300/80 font-medium">
                MRZ detected
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300/70 font-mono">
                {mrzResult.format}
              </span>
            </div>

            {/* Toggle raw MRZ */}
            <button
              id="toggle-raw-mrz-btn"
              onClick={() => setShowRawMRZ(!showRawMRZ)}
              className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              <FileText className="w-3 h-3" />
              Raw MRZ
              {showRawMRZ ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-300/70">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs">
              No MRZ detected. Try a clearer image of the document back.
            </span>
          </div>
        )}

        {/* Collapsible raw MRZ display */}
        {showRawMRZ && mrzResult && (
          <div className="mt-3 p-3 rounded-xl bg-black/30 border border-white/5">
            <pre className="text-[11px] text-cyan-300/60 font-mono leading-relaxed whitespace-pre-wrap break-all">
              {mrzResult.rawMRZ}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
