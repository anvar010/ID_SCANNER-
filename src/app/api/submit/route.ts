import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Read the incoming form data from the client
    const formData = await request.formData();

    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {
      throw new Error("API_URL environment variable is not set");
    }

    // Build a new FormData to forward
    // Node fetch FormData can differ from browser FormData,
    // so we rebuild it to ensure compatibility
    const forwardData = new FormData();
    for (const [key, value] of formData.entries()) {
      forwardData.append(key, value);
    }

    // Forward the request to the external PHP backend
    const response = await fetch(apiUrl, {
      method: "POST",
      body: forwardData,
    });

    const responseText = await response.text();
    console.log(`[API Proxy] ${apiUrl} responded with status ${response.status}:`, responseText.substring(0, 500));

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend returned ${response.status}`, detail: responseText.substring(0, 500) },
        { status: response.status }
      );
    }

    // Return the response back to the client
    return new NextResponse(responseText, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error: any) {
    console.error("Proxy error:", error.message || error);
    return NextResponse.json(
      { error: "Failed to connect to the backend server.", detail: error.message },
      { status: 500 }
    );
  }
}

