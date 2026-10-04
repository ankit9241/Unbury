import { NextResponse } from "next/server";
import { getGroupedMemories } from "@/lib/db/memories";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const memories = await getGroupedMemories();
    return NextResponse.json({ memories });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to retrieve memories.",
        memories: { People: [], Deadlines: [], Context: [] },
      },
      { status: 500 }
    );
  }
}
