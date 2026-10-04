import { NextResponse } from "next/server";
import { getDashboardDumps, getSourceById } from "@/lib/db/sources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") || searchParams.get("sourceId");
    if (id) {
      const source = await getSourceById(id);
      if (!source) {
        return NextResponse.json({ error: "Source not found" }, { status: 404 });
      }
      return NextResponse.json({
        source: {
          _id: source._id.toString(),
          type: source.type,
          content: source.content,
          createdAt: source.createdAt.toISOString(),
          processingStatus: source.processingStatus,
        },
      });
    }

    const dumps = await getDashboardDumps();
    return NextResponse.json({ dumps });
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve inbox dumps.", dumps: [] },
      { status: 500 }
    );
  }
}
