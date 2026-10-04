import { NextRequest, NextResponse } from "next/server";
import { processDump } from "@/lib/pipeline";
import { extractTextFromPdf } from "@/lib/pdf";
import { createSource, updateSourceStatus } from "@/lib/db/sources";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = (formData.get("pdf") || formData.get("file")) as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No PDF file provided." },
        { status: 400 }
      );
    }

    if (file.type && file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF document." },
        { status: 400 }
      );
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "PDF file too large. Maximum size is 20MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let pdfText = "";
    try {
      pdfText = await extractTextFromPdf(buffer);
    } catch {
      const source = await createSource(
        "PDF upload (text extraction failed)",
        "pdf",
        file.name,
        "application/pdf"
      );
      await updateSourceStatus(source._id, "failed", "PDF extraction failed");
      return NextResponse.json(
        { error: "Couldn't extract readable text from this PDF." },
        { status: 422 }
      );
    }

    if (!pdfText.trim()) {
      const source = await createSource(
        "PDF upload (no readable text found)",
        "pdf",
        file.name,
        "application/pdf"
      );
      await updateSourceStatus(source._id, "completed");
      return NextResponse.json(
        { error: "Couldn't extract readable text from this PDF." },
        { status: 422 }
      );
    }

    const result = await processDump({
      content: pdfText,
      sourceType: "pdf",
      originalFileName: file.name,
      mimeType: "application/pdf",
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to process PDF dump. Please try again." },
      { status: 500 }
    );
  }
}
