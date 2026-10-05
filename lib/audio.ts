import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { GoogleGenAI } from "@google/genai";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Google transcription path (production: AI_PROVIDER=google)
// ---------------------------------------------------------------------------

export async function transcribeAudioWithGoogle(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Google AI transcription is not configured. Missing GOOGLE_AI_API_KEY."
    );
  }

  // gemini-3.5-transcribe is the dedicated speech recognition model.
  const transcribeModel = "gemini-3.5-transcribe";

  console.log("[audio-google] transcribing with model:", transcribeModel, {
    mimeType,
    byteSize: buffer.byteLength,
  });

  const ai = new GoogleGenAI({ apiKey });

  // The SDK accepts inlineData parts with base64-encoded audio data.
  // Supported MIME types include audio/webm, audio/mp4, audio/ogg, etc.
  const base64Audio = buffer.toString("base64");

  const response = await ai.models.generateContent({
    model: transcribeModel,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Audio,
            },
          },
        ],
      },
    ],
    config: {
      audioTranscriptionConfig: {},
    },
  });

  let transcript = (response.text ?? "").trim();

  if (!transcript && response.candidates) {
    const textParts: string[] = [];
    for (const candidate of response.candidates) {
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            textParts.push(part.text);
          } else if (
            part.audioTranscription &&
            typeof part.audioTranscription === "object" &&
            "text" in part.audioTranscription &&
            typeof (part.audioTranscription as { text?: unknown }).text === "string"
          ) {
            textParts.push((part.audioTranscription as { text: string }).text);
          }
        }
      }
    }
    transcript = textParts.join(" ").trim();
  }

  if (!transcript) {
    console.warn("[audio-google] transcription returned empty text");
    throw new Error("No speech detected in audio.");
  }

  console.log(
    "[audio-google] transcription succeeded, length:",
    transcript.length
  );
  return transcript;
}

// ---------------------------------------------------------------------------
// Local Python/Whisper transcription path (local: AI_PROVIDER=ollama)
// ---------------------------------------------------------------------------

export async function transcribeAudio(
  buffer: Buffer,
  originalFilename = "audio.webm"
): Promise<string> {
  const tempDir = os.tmpdir();
  const id = randomUUID();
  const ext = path.extname(originalFilename) || ".webm";
  const inputPath = path.join(tempDir, `unbury_${id}${ext}`);
  const outputPath = path.join(tempDir, `unbury_${id}.wav`);
  const scriptPath = path.join(process.cwd(), "scripts", "transcribe.py");

  await fs.writeFile(inputPath, buffer);

  try {
    // 1. Convert input audio to 16kHz mono WAV using ffmpeg
    let ffmpegAvailable = true;
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-ar",
        "16000",
        "-ac",
        "1",
        outputPath,
      ]);
    } catch (ffmpegErr: unknown) {
      const code =
        ffmpegErr &&
        typeof ffmpegErr === "object" &&
        "code" in ffmpegErr
          ? (ffmpegErr as { code: string }).code
          : undefined;
      if (code === "ENOENT") {
        console.warn("[audio] ffmpeg not found on PATH — attempting raw copy");
        ffmpegAvailable = false;
      } else {
        const stderr =
          ffmpegErr &&
          typeof ffmpegErr === "object" &&
          "stderr" in ffmpegErr
            ? (ffmpegErr as { stderr: string }).stderr
            : String(ffmpegErr);
        console.warn("[audio] ffmpeg conversion failed:", stderr);
        ffmpegAvailable = false;
      }
      await fs.copyFile(inputPath, outputPath);
    }

    if (ffmpegAvailable) {
      console.log("[audio] ffmpeg conversion succeeded");
    }

    // 2. Run local Python transcription script
    const pythonBins =
      process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
    let stdout = "";
    let lastError: unknown = null;
    let resolvedBin: string | null = null;

    for (const bin of pythonBins) {
      try {
        console.log(`[audio] trying python binary: ${bin}`);
        const res = await execFileAsync(bin, [scriptPath, outputPath], {
          timeout: 30000,
        });
        stdout = res.stdout;
        lastError = null;
        resolvedBin = bin;
        break;
      } catch (err: unknown) {
        lastError = err;
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code: string }).code
            : undefined;
        if (code === "ENOENT") {
          console.warn(`[audio] binary not found: ${bin}`);
          continue;
        }
        const stderr =
          err && typeof err === "object" && "stderr" in err
            ? (err as { stderr: string }).stderr
            : String(err);
        console.error(`[audio] transcribe.py failed with ${bin}:`, stderr);
        throw err;
      }
    }

    if (lastError) {
      console.error(
        "[audio] no usable python binary found on PATH:",
        pythonBins
      );
      throw Object.assign(
        new Error(
          `No Python binary found on PATH. Tried: ${pythonBins.join(", ")}`
        ),
        { code: "PYTHON_NOT_FOUND" }
      );
    }

    console.log(`[audio] transcription succeeded via ${resolvedBin}`);

    const transcript = (stdout || "").trim();
    if (!transcript) {
      throw new Error("No speech detected in audio.");
    }

    return transcript;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}
