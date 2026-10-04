import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processDump } from "@/lib/pipeline";
import { ExtractionError } from "@/lib/ai/gemma";

const dumpInputSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { message: "Input cannot be empty." })
    .max(5000, { message: "Input exceeds maximum limit of 5000 characters." }),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parsedInput = dumpInputSchema.safeParse(body);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0]?.message || "Invalid input.";
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const { content } = parsedInput.data;

  try {
    const result = await processDump({
      content,
      sourceType: "text",
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Dump processing error:", err);
    if (err instanceof ExtractionError) {
      return NextResponse.json(
        { error: "Couldn't understand that dump. Try again." },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: "Service temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
