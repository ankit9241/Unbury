import { NextRequest, NextResponse } from "next/server";
import { processDump } from "@/lib/pipeline";
import { transcribeAudio } from "@/lib/audio";
import { createSource, updateSourceStatus } from "@/lib/db/sources";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = (formData.get("audio") || formData.get("file")) as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided." },
        { status: 400 }
      );
    }

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Audio file too large. Maximum size is 25MB." },
        { status: 400 }
      );
    }

    const mimeType = file.type || "audio/webm";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let transcript = "";
    try {
      transcript = await transcribeAudio(buffer, file.name || "audio.webm");
    } catch {
      const source = await createSource(
        "Audio recording (transcription failed)",
        "audio",
        file.name || "voice-note.webm",
        mimeType
      );
      await updateSourceStatus(source._id, "failed", "Transcription failed");
      return NextResponse.json(
        { error: "Couldn't understand the audio. Try recording again." },
        { status: 422 }
      );
    }

    if (!transcript.trim()) {
      const source = await createSource(
        "Audio recording (no speech detected)",
        "audio",
        file.name || "voice-note.webm",
        mimeType
      );
      await updateSourceStatus(source._id, "completed");
      return NextResponse.json(
        { error: "Couldn't understand the audio. Try recording again." },
        { status: 422 }
      );
    }

    const result = await processDump({
      content: transcript,
      sourceType: "audio",
      originalFileName: file.name || "voice-note.webm",
      mimeType,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to process audio dump. Please try again." },
      { status: 500 }
    );
  }
}
