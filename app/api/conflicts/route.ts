import { NextResponse } from "next/server";
import { getPendingConflicts, resolveConflictAcceptNew } from "@/lib/db/conflicts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const conflicts = await getPendingConflicts();
    return NextResponse.json({
      conflicts: conflicts.map((c) => ({
        _id: c._id.toString(),
        taskId: c.taskId.toString(),
        existingDeadline: c.existingDeadline,
        existingEvidence: c.existingEvidence,
        newDeadline: c.newDeadline,
        newEvidence: c.newEvidence,
        sourceId: c.sourceId.toString(),
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch conflicts";
    return NextResponse.json({ error: message, conflicts: [] }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.conflictId || !body.action) {
      return NextResponse.json(
        { error: "Missing conflictId or action in request body." },
        { status: 400 }
      );
    }

    if (body.action !== "accept_new") {
      return NextResponse.json(
        { error: `Unsupported action: '${body.action}'. Only 'accept_new' is supported.` },
        { status: 400 }
      );
    }

    const result = await resolveConflictAcceptNew(body.conflictId);
    return NextResponse.json({
      success: true,
      conflict: {
        _id: result.conflict._id.toString(),
        taskId: result.conflict.taskId.toString(),
        status: result.conflict.status,
        resolvedAt: result.conflict.resolvedAt ? result.conflict.resolvedAt.toISOString() : null,
      },
      task: {
        _id: result.task._id.toString(),
        deadline: result.task.deadline,
        evidence: result.task.evidence,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to resolve conflict";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
