import { createWorker } from "tesseract.js";
import path from "path";

export function cleanOcrArtifacts(raw: string): string {
  if (!raw) return "";

  const lines = raw.split("\n");
  const cleanedLines: string[] = [];

  for (let line of lines) {
    let trimmed = line.trim();
    if (!trimmed) {
      cleanedLines.push("");
      continue;
    }

    // 1. Standalone timestamp lines (e.g. "22:29", "10:15 PM", "08:45 AM")
    if (/^([01]?\d|2[0-3])[:.][0-5]\d(\s*(?:am|pm|a\.m\.|p\.m\.))?$/i.test(trimmed)) {
      continue;
    }
    // 4-digit timestamp misread like 2229
    if (/^2[0-3][0-5]\d$/.test(trimmed)) {
      continue;
    }

    // 2. Standalone mobile status/chrome lines (battery, network, "Yesterday", "Today")
    if (/^\d{1,3}%$/.test(trimmed)) continue;
    if (/^(LTE|5G|4G|WiFi|VoLTE|online|typing\.\.\.)$/i.test(trimmed)) continue;

    // 3. Trailing WhatsApp/chat timestamps on message lines:
    // e.g. "@Akshay DU operations 22:29" or "@Akshay DU operations 2229"
    // Do NOT strip legitimate time expressions like "at 6 PM" or "by 11:59 PM"
    trimmed = trimmed
      .replace(
        /(?<!\b(?:at|by|before|until|till|due)\s+)(?:\b([01]?\d|2[0-3])[:.][0-5]\d\b(?:\s*(?:am|pm|a\.m\.|p\.m\.))?|\b2[0-3][0-5]\d\b)\s*$/i,
        ""
      )
      .trim();

    cleanedLines.push(trimmed);
  }

  return cleanedLines.join("\n").trim();
}

export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "tesseract.js",
    "src",
    "worker-script",
    "node",
    "index.js"
  );

  const worker = await createWorker("eng", 1, {
    workerPath,
  });

  try {
    const ret = await worker.recognize(buffer);
    const rawText = (ret.data.text || "").trim();
    return cleanOcrArtifacts(rawText);
  } finally {
    await worker.terminate();
  }
}
