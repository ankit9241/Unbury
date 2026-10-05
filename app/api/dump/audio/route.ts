import { NextRequest, NextResponse } from "next/server";
import { processDump } from "@/lib/pipeline";
import { transcribeAudio, transcribeAudioWithGoogle } from "@/lib/audio";
import { createSource, updateSourceStatus } from "@/lib/db/sources";
import { getAIProvider } from "@/lib/ai/provider";

export async function POST(request: NextRequest) {
  let mimeType = "audio/webm";
  let byteSize = 0;

  try {
    const formData = await request.formData().catch((err: unknown) => {
      console.error("[audio-upload] failed to parse FormData:", {
        stage: "audio-upload",
        name: err instanceof Error ? err.name : "UnknownError",
        message: err instanceof Error ? err.message : String(err),
      });
      throw Object.assign(new Error("FormData parse failed"), {
        stage: "audio-upload",
      });
    });

    const file = (formData.get("audio") || formData.get("file")) as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided.", code: "AUDIO_UPLOAD_FAILED" },
        { status: 400 }
      );
    }

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error: "Audio file too large. Maximum size is 25MB.",
          code: "AUDIO_UPLOAD_FAILED",
        },
        { status: 400 }
      );
    }

    mimeType = file.type || "audio/webm";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    byteSize = buffer.byteLength;

    const provider = getAIProvider();
    console.log("[audio-upload] received audio", {
      mimeType,
      byteSize,
      filename: file.name || "voice-note.webm",
      provider,
    });

    // --- Transcription stage ---
    let transcript = "";
    try {
      if (provider === "google") {
        // Production: use Google hosted transcription (no Python/ffmpeg required)
        transcript = await transcribeAudioWithGoogle(buffer, mimeType);
      } else {
        // Local: use Python/Whisper transcription
        transcript = await transcribeAudio(buffer, file.name || "audio.webm");
      }
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "UnknownError";
      const message = err instanceof Error ? err.message : String(err);
      console.error("[audio-upload] transcription failed", {
        stage: "transcription",
        name,
        message,
        mimeType,
        byteSize,
        provider,
      });
      const source = await createSource(
        "Audio recording (transcription failed)",
        "audio",
        file.name || "voice-note.webm",
        mimeType
      );
      await updateSourceStatus(source._id, "failed", "Transcription failed");
      return NextResponse.json(
        {
          error: `Transcription failed: ${message}`,
          code: "TRANSCRIPTION_FAILED",
        },
        { status: 422 }
      );
    }

    if (!transcript.trim()) {
      console.warn("[audio-upload] transcription returned empty text", {
        stage: "transcription",
        mimeType,
        byteSize,
        provider,
      });
      const source = await createSource(
        "Audio recording (no speech detected)",
        "audio",
        file.name || "voice-note.webm",
        mimeType
      );
      await updateSourceStatus(source._id, "completed");
      return NextResponse.json(
        {
          error: "Couldn't understand the audio. Try recording again.",
          code: "TRANSCRIPTION_FAILED",
        },
        { status: 422 }
      );
    }

    // --- Extraction stage (unchanged, shared by both providers) ---
    try {
      const result = await processDump({
        content: transcript,
        sourceType: "audio",
        originalFileName: file.name || "voice-note.webm",
        mimeType,
      });
      return NextResponse.json(result);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "UnknownError";
      const message = err instanceof Error ? err.message : String(err);
      console.error("[audio-upload] extraction failed", {
        stage: "extraction",
        name,
        message,
        mimeType,
        byteSize,
        provider,
      });
      return NextResponse.json(
        {
          error: "Failed to extract tasks from audio. Please try again.",
          code: "EXTRACTION_FAILED",
        },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : "UnknownError";
    const message = err instanceof Error ? err.message : String(err);
    const stage =
      err && typeof err === "object" && "stage" in err
        ? (err as { stage: string }).stage
        : "audio-upload";
    console.error("[audio-upload] unexpected error", {
      stage,
      name,
      message,
      mimeType,
      byteSize,
    });
    return NextResponse.json(
      {
        error: "Failed to process audio dump. Please try again.",
        code: "AUDIO_UPLOAD_FAILED",
      },
      { status: 500 }
    );
  }
}
