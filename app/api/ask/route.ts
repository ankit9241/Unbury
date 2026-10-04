import { NextResponse } from "next/server";
import { askUnbury } from "@/lib/ai/ask";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body || typeof body.question !== "string") {
      return NextResponse.json(
        { error: "Question must be a non-empty string." },
        { status: 400 }
      );
    }

    const question = body.question.trim();
    if (!question) {
      return NextResponse.json(
        { error: "Question cannot be empty." },
        { status: 400 }
      );
    }

    if (question.length > 500) {
      return NextResponse.json(
        { error: "Question must not exceed 500 characters." },
        { status: 400 }
      );
    }

    const result = await askUnbury(question);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process question";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
