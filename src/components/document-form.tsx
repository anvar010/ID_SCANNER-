"use client";

/**
 * DocumentForm — Displays extracted MRZ data in editable form fields.
 */

import React from "react";
import type { MRZResult } from "@/lib/mrz-parser";

interface DocumentFormProps {
  data: MRZResult | null;
  isProcessing: boolean;
  onChange: (field: keyof MRZResult, value: string) => void;
}

function FieldSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-md h-[46px] bg-gray-100 border border-gray-200">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-200/50 to-transparent animate-shimmer" />
    </div>
  );
}

function FormField({
  id,
  label,
  value,
  type = "text",
  isProcessing,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  type?: "text" | "date" | "select";
  isProcessing: boolean;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
}) {
  if (isProcessing) {
    return (
      <div className="space-y-1.5">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          {label} <span className="text-red-500">*</span>
        </label>
        <FieldSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest"
      >
        {label} <span className="text-red-500">*</span>
      </label>

      {type === "select" && options ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="
            w-full h-[46px] px-3 rounded-md
            bg-white border border-gray-300
            text-gray-800 text-sm
            outline-none
            focus:border-black focus:ring-1 focus:ring-black/5
            transition-all duration-200
            appearance-none cursor-pointer
          "
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(0,0,0,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-white text-gray-800">
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          required
          className="
            w-full h-[46px] px-3 rounded-md
            bg-white border border-gray-300
            text-gray-800 text-sm placeholder:text-gray-400
            outline-none
            focus:border-black focus:ring-1 focus:ring-black/5
            transition-all duration-200
          "
        />
      )}
    </div>
  );
}

export default function DocumentForm({
  data,
  isProcessing,
  onChange,
}: DocumentFormProps) {
  return (
    <div className="space-y-5 p-4 sm:p-8">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-black uppercase tracking-wider">
          EXTRACTED DETAILS
        </h2>
      </div>

      <div className="grid gap-5 min-w-0">
        <FormField
          id="field-id-number"
          label="ID NUMBER"
          value={data?.idNumber ?? ""}
          isProcessing={isProcessing}
          onChange={(val) => onChange("idNumber", val)}
        />

        <FormField
          id="field-full-name"
          label="FULL NAME"
          value={data?.fullName ?? ""}
          isProcessing={isProcessing}
          onChange={(val) => onChange("fullName", val)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField
            id="field-nationality"
            label="NATIONALITY"
            value={data?.nationality ?? ""}
            isProcessing={isProcessing}
            onChange={(val) => onChange("nationality", val)}
          />

          <FormField
            id="field-sex"
            label="GENDER"
            value={data?.sex ?? "Unknown"}
            type="select"
            isProcessing={isProcessing}
            onChange={(val) => onChange("sex", val)}
            options={[
              { value: "Unknown", label: "Select..." },
              { value: "Male", label: "Male" },
              { value: "Female", label: "Female" },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField
            id="field-date-of-birth"
            label="DATE OF BIRTH"
            value={data?.dateOfBirth ?? ""}
            type="date"
            isProcessing={isProcessing}
            onChange={(val) => onChange("dateOfBirth", val)}
          />
          <FormField
            id="field-expiry-date"
            label="EXPIRY DATE"
            value={data?.expiryDate ?? ""}
            type="date"
            isProcessing={isProcessing}
            onChange={(val) => onChange("expiryDate", val)}
          />
        </div>
      </div>
    </div>
  );
}
