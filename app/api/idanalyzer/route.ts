import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDANALYZER_ENDPOINT = "https://api2.idanalyzer.com/scan";
const API_KEY =
  process.env.IDANALYZER_API_KEY || "cW5ZclHW6IrEdT26mOP1IcFdHh9cqqUz";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("document");
    const back = form.get("documentBack");
    const profile = form.get("profile");
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing 'document' file in form data." },
        { status: 400 },
      );
    }
    const frontBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const backBase64 =
      back instanceof Blob
        ? Buffer.from(await back.arrayBuffer()).toString("base64")
        : null;

    const body: Record<string, unknown> = { document: frontBase64 };
    if (backBase64) body.documentBack = backBase64;
    if (typeof profile === "string" && profile) body.profile = profile;

    const upstream = await fetch(IDANALYZER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": API_KEY,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          error: "Upstream returned non-JSON response.",
          status: upstream.status,
          body: text.slice(0, 2000),
        },
        { status: 502 },
      );
    }
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "IDAnalyzer error", status: upstream.status, body: json },
        { status: upstream.status },
      );
    }
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
