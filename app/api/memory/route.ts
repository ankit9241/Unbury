import { NextResponse } from "next/server";
import { getMemories, populateMemoriesWithContext } from "@/lib/db/memories";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || undefined;
    const taskId = searchParams.get("taskId") || undefined;

    const docs = await getMemories({ type, taskId });
    const memories = await populateMemoriesWithContext(docs);

    return NextResponse.json({ memories });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve memories";
    return NextResponse.json({ error: message, memories: [] }, { status: 500 });
  }
}
