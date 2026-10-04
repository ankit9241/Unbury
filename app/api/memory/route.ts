import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  getMemories,
  populateMemoriesWithContext,
  updateMemory,
  deleteMemory,
} from "@/lib/db/memories";

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
    console.error("Memories retrieval error:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Failed to retrieve memories.", memories: [] }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.memoryId || !ObjectId.isValid(body.memoryId)) {
      return NextResponse.json(
        { error: "Valid memoryId is required in request body." },
        { status: 400 }
      );
    }

    const { memoryId, title, content } = body;
    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Title cannot be empty." },
        { status: 400 }
      );
    }
    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Content cannot be empty." },
        { status: 400 }
      );
    }

    const updated = await updateMemory(memoryId, { title, content });
    if (!updated) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, memory: updated });
  } catch (err: unknown) {
    console.error("Memory update error:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Failed to update memory. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    let memoryId: string | null = null;
    const { searchParams } = new URL(request.url);
    memoryId = searchParams.get("memoryId");

    if (!memoryId) {
      try {
        const body = await request.json();
        memoryId = body?.memoryId;
      } catch {
        // empty body
      }
    }

    if (!memoryId || !ObjectId.isValid(memoryId)) {
      return NextResponse.json(
        { error: "Valid memoryId is required." },
        { status: 400 }
      );
    }

    const success = await deleteMemory(memoryId);
    if (!success) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, memoryId });
  } catch (err: unknown) {
    console.error("Memory delete error:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Failed to delete memory. Please try again." }, { status: 500 });
  }
}
