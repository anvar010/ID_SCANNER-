"use client";

import React, { useRef, useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";

export interface PatientData {
  email: string;
  mobile: string;
  bloodPressure: string;
  pulse: string;
  allergies: string;
  medicalHistory: string;
  treatment: string;
  amount: string;
  paymentMode: string;
  dateTime: string;
  registeredNurse: string;
  cr: string;
  howDidYouKnow: string;
  signature: string | null;
}

interface PatientConsentFormProps {
  data: PatientData;
  onChange: (field: keyof PatientData, value: string | null) => void;
}

export default function PatientConsentForm({ data, onChange }: PatientConsentFormProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#000000"; // Black signature
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, []);

  const getCoordinates = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Scale factor: canvas internal resolution vs displayed CSS size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in event) {
      return {
        x: (event.touches[0].clientX - rect.left) * scaleX,
        y: (event.touches[0].clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (e.cancelable) e.preventDefault();
    setIsDrawing(true);
    const coords = getCoordinates(e);
    if (coords && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (e.cancelable) e.preventDefault();
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    if (coords && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      setIsDrawing(false);
      const dataUrl = canvasRef.current.toDataURL("image/png");
      onChange("signature", dataUrl);
    }
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      onChange("signature", null);
    }
  };

  const renderField = (
    id: keyof PatientData,
    label: string,
    placeholder: string,
    type: string = "text",
    prefix?: string
  ) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-gray-500 text-sm font-medium z-10">{prefix}</span>
        )}
        <input
          id={id}
          type={type}
          value={(data[id] as string) || ""}
          onChange={(e) => onChange(id, e.target.value)}
          placeholder={placeholder}
          required
          className={`
            w-full h-[46px] rounded-md
            bg-white border border-gray-300
            text-gray-800 text-sm placeholder:text-gray-400
            outline-none
            focus:border-black focus:ring-1 focus:ring-black/5
            transition-all duration-200
            ${prefix ? "pl-14 pr-3" : "px-3"}
          `}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-black uppercase tracking-wider">
          PATIENT & CONSENT DETAILS
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 min-w-0">
        {renderField("email", "Email", "name@example.com", "email")}
        {renderField("mobile", "Mobile", "50 123 4567", "tel", "+971")}
        {renderField("bloodPressure", "Blood Pressure", "120/80")}
        {renderField("pulse", "Pulse", "bpm")}
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="allergies" className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Allergies <span className="text-red-500">*</span>
          </label>
          <textarea
            id="allergies"
            value={data.allergies || ""}
            onChange={(e) => onChange("allergies", e.target.value)}
            placeholder="List any allergies, or 'None'"
            rows={2}
            required
            className="w-full px-3 py-3 rounded-md bg-white border border-gray-300 text-gray-800 text-sm placeholder:text-gray-400 outline-none focus:border-black focus:ring-1 focus:ring-black/5 transition-all duration-200 resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="medicalHistory" className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Medical History <span className="text-red-500">*</span>
          </label>
          <textarea
            id="medicalHistory"
            value={data.medicalHistory || ""}
            onChange={(e) => onChange("medicalHistory", e.target.value)}
            placeholder="Relevant medical history"
            rows={3}
            required
            className="w-full px-3 py-3 rounded-md bg-white border border-gray-300 text-gray-800 text-sm placeholder:text-gray-400 outline-none focus:border-black focus:ring-1 focus:ring-black/5 transition-all duration-200 resize-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 min-w-0">
        <div className="space-y-1.5">
          <label htmlFor="treatment" className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Treatment <span className="text-red-500">*</span>
          </label>
          <select
            id="treatment"
            value={data.treatment || ""}
            onChange={(e) => onChange("treatment", e.target.value)}
            required
            className="w-full h-[46px] px-3 rounded-md bg-white border border-gray-300 text-gray-800 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/5 transition-all duration-200 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(0,0,0,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
            }}
          >
            <option value="" disabled className="bg-white text-gray-400">Select treatment...</option>
            <option value="Multi Vitamin Mineral Therapy" className="bg-white text-gray-800">Multi Vitamin Mineral Therapy</option>
            <option value="IV Hydration Therapy" className="bg-white text-gray-800">IV Hydration Therapy</option>
            <option value="Vitamin C Boost" className="bg-white text-gray-800">Vitamin C Boost</option>
          </select>
        </div>

        {renderField("amount", "Amount", "AED")}

        <div className="space-y-1.5">
          <label htmlFor="paymentMode" className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Payment Mode <span className="text-red-500">*</span>
          </label>
          <select
            id="paymentMode"
            value={data.paymentMode || ""}
            onChange={(e) => onChange("paymentMode", e.target.value)}
            required
            className="w-full h-[46px] px-3 rounded-md bg-white border border-gray-300 text-gray-800 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/5 transition-all duration-200 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(0,0,0,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
            }}
          >
            <option value="" disabled className="bg-white text-gray-400">Select...</option>
            <option value="Cash" className="bg-white text-gray-800">Cash</option>
            <option value="Card" className="bg-white text-gray-800">Card</option>
            <option value="Payment Link" className="bg-white text-gray-800">Payment Link</option>
          </select>
        </div>

        {renderField("dateTime", "Date and Time", "", "datetime-local")}
        {renderField("registeredNurse", "Registered Nurse", "Nurse name")}
        <div className="space-y-1.5">
          <label htmlFor="cr" className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Branch <span className="text-red-500">*</span>
          </label>
          <select
            id="cr"
            value={data.cr || ""}
            onChange={(e) => onChange("cr", e.target.value)}
            required
            className="w-full h-[46px] px-3 rounded-md bg-white border border-gray-300 text-gray-800 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/5 transition-all duration-200 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(0,0,0,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
            }}
          >
            <option value="" disabled className="bg-white text-gray-400">Select branch...</option>
            <option value="DIFC" className="bg-white text-gray-800">DIFC</option>
            <option value="Palm Jumeirah" className="bg-white text-gray-800">Palm Jumeirah</option>
            <option value="Home Service" className="bg-white text-gray-800">Home Service</option>
          </select>
        </div>
      </div>

      {/* How do you know about us */}
      <div className="space-y-3 pt-2">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          How do you know about us <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {["Google", "Social Media", "Justlife", "Friend"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange("howDidYouKnow", option)}
              className={`
                px-4 py-2 text-xs font-semibold rounded-md transition-all duration-200 border
                ${data.howDidYouKnow === option 
                  ? "bg-black border-black text-white" 
                  : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                }
              `}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Signature Pad */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Customer Sign <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={clearSignature}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-red-500 hover:text-red-600 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Clear
          </button>
        </div>
        <div className="relative rounded-md overflow-hidden bg-white border-2 border-dashed border-gray-300">
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="w-full h-[160px] touch-none cursor-crosshair"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {!data.signature && !isDrawing && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <span className="text-gray-400 text-sm font-medium tracking-wider">Sign Here</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
