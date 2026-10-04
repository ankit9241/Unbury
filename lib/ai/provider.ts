import { GoogleGenAI } from "@google/genai";

export class AIProviderError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface ChatCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  jsonFormat?: Record<string, unknown>;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}

export type AIProvider = "ollama" | "google";

export function getAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || "ollama").toLowerCase().trim();
  if (provider === "google") {
    return "google";
  }
  return "ollama";
}

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export function stripMarkdownFences(raw: string): string {
  let cleaned = raw.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleaned);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return cleaned;
}

async function callOllama(options: ChatCompletionOptions): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "gemma3";
  const apiKey = process.env.OLLAMA_API_KEY?.trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);

  let response: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
        stream: false,
        ...(options.jsonFormat ? { format: options.jsonFormat } : {}),
        options: {
          temperature: options.temperature ?? 0.1,
          num_predict: options.numPredict ?? 2048,
        },
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new AIProviderError("AI request timed out. Please try again.");
    }
    throw new AIProviderError("Could not reach AI service. Please ensure the model server is available.", err);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new AIProviderError(`AI service returned error (${response.status}). Please try again later.`);
  }

  try {
    const result = await response.json();
    const content = result?.message?.content || "";
    return stripMarkdownFences(content);
  } catch (err: unknown) {
    throw new AIProviderError("Failed to parse AI service response.", err);
  }
}

async function callGoogle(options: ChatCompletionOptions): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new AIProviderError("Google AI service is not configured. Missing GOOGLE_AI_API_KEY.");
  }
  const model = process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);

  try {
    const ai = new GoogleGenAI({ apiKey });

    const config: Record<string, unknown> = {
      abortSignal: controller.signal,
      systemInstruction: options.systemPrompt,
      temperature: options.temperature ?? 0.1,
      responseMimeType: "application/json",
    };

    if (options.jsonFormat) {
      config.responseSchema = options.jsonFormat;
    }

    const response = await ai.models.generateContent({
      model,
      contents: options.userPrompt,
      config,
    });

    const text = response.text || "";
    return stripMarkdownFences(text);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof AIProviderError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new AIProviderError("AI request timed out. Please try again.");
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const sanitizedMsg = apiKey ? errMsg.replace(new RegExp(escapeRegex(apiKey), "g"), "[REDACTED]") : errMsg;
    console.error("Google AI service error:", sanitizedMsg);
    throw new AIProviderError("AI service returned error. Please try again later.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const provider = getAIProvider();
  if (provider === "google") {
    return callGoogle(options);
  }
  return callOllama(options);
}
