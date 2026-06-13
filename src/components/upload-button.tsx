"use client";

/**
 * UploadButton — Handles document upload via click or drag-and-drop.
 * Supports images (jpg, png, webp) and PDFs.
 */

import React, { useRef, useState, useCallback } from "react";
import { Upload, FileImage } from "lucide-react";

interface UploadButtonProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  label?: string;
}

const ACCEPTED_TYPES = ".jpg,.jpeg,.png,.webp,.pdf";
const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export default function UploadButton({ onFileSelected, disabled, label = "Upload Document" }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
      // Reset so same file can be re-uploaded
      e.target.value = "";
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file && ACCEPTED_MIME.includes(file.type)) {
        onFileSelected(file);
      }
    },
    [onFileSelected]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        className="hidden"
        id={`upload-document-input-${label.replace(/\s+/g, "-").toLowerCase()}`}
      />
      <button
        id={`upload-document-btn-${label.replace(/\s+/g, "-").toLowerCase()}`}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={disabled}
        className={`
          group relative flex-1 flex items-center justify-center gap-3
          rounded-2xl border-2 border-dashed px-6 py-5
          text-sm font-semibold tracking-wide
          transition-all duration-300 ease-out
          cursor-pointer
          ${
            isDragOver
              ? "border-cyan-500 bg-cyan-50 text-cyan-600 scale-[1.02] shadow-md shadow-cyan-500/10"
              : "border-gray-300 bg-white/50 text-gray-700 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Upload
              className={`w-5 h-5 transition-transform duration-300 ${
                isDragOver ? "scale-110" : "group-hover:-translate-y-0.5"
              }`}
            />
            <FileImage className="w-3 h-3 absolute -bottom-1 -right-1 opacity-50" />
          </div>
          <span>{label}</span>
        </div>

        {/* Subtle glow effect on hover */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      </button>
    </>
  );
}
