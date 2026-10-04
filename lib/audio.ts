import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

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
    } catch {
      // If ffmpeg direct conversion fails or input is already wav
      await fs.copyFile(inputPath, outputPath);
    }

    // 2. Run local Python transcription script
    const pythonBins = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
    let stdout = "";
    let lastError: unknown = null;

    for (const bin of pythonBins) {
      try {
        const res = await execFileAsync(bin, [scriptPath, outputPath], {
          timeout: 30000,
        });
        stdout = res.stdout;
        lastError = null;
        break;
      } catch (err: unknown) {
        lastError = err;
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
          continue;
        }
        throw err;
      }
    }

    if (lastError) {
      throw lastError;
    }

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
