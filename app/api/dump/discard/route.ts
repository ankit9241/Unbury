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
    const message = err instanceof Error ? err.message : "Failed to discard proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
