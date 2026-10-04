import { NextResponse } from "next/server";
import { confirmProposal } from "@/lib/pipeline";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.sourceId) {
      return NextResponse.json({ error: "Missing sourceId in confirmation payload." }, { status: 400 });
    }

    const result = await confirmProposal({
      sourceId: body.sourceId,
      tasks: Array.isArray(body.tasks) ? body.tasks : [],
      memories: Array.isArray(body.memories) ? body.memories : [],
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Proposal confirm error:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Failed to confirm proposal. Please try again." }, { status: 500 });
  }
}
