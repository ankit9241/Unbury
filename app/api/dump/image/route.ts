import { NextRequest, NextResponse } from "next/server";
import { processDump } from "@/lib/pipeline";
import { extractTextFromImage } from "@/lib/ocr";
import { createSource, updateSourceStatus } from "@/lib/db/sources";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = (formData.get("image") || formData.get("file")) as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported image type. Please upload a JPEG, PNG, or WebP image." },
        { status: 400 }
      );
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Image file too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let ocrText = "";
    try {
      ocrText = await extractTextFromImage(buffer);
    } catch {
      const source = await createSource(
        "Image upload (OCR processing failed)",
        "image",
        file.name,
        file.type
      );
      await updateSourceStatus(source._id, "failed", "OCR failed");
      return NextResponse.json(
        { error: "Couldn't find readable text in this image." },
        { status: 422 }
      );
    }

    if (!ocrText.trim()) {
      const source = await createSource(
        "Image upload (no readable text found)",
        "image",
        file.name,
        file.type
      );
      await updateSourceStatus(source._id, "completed");
      return NextResponse.json(
        { error: "Couldn't find readable text in this image." },
        { status: 422 }
      );
    }

    const result = await processDump({
      content: ocrText,
      sourceType: "image",
      originalFileName: file.name,
      mimeType: file.type,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to process image dump. Please try again." },
      { status: 500 }
    );
  }
}
