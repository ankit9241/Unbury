import { NextResponse } from "next/server";
import { discardProposal } from "@/lib/pipeline";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.sourceId) {
      await discardProposal(body.sourceId);
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Proposal discard error:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Failed to discard proposal. Please try again." }, { status: 500 });
  }
}
