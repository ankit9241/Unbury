import { NextResponse } from "next/server";
import { getDashboardTasks } from "@/lib/db/tasks";
import {
  updateTaskDeadlineAndReminders,
  completeTaskAndCancelReminders,
} from "@/lib/db/reminders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tasks = await getDashboardTasks();
    return NextResponse.json({ tasks });
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve tasks.", tasks: [] },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.taskId) {
      return NextResponse.json(
        { error: "Missing taskId in request body." },
        { status: 400 }
      );
    }

    const { taskId, deadline, status, reminderOffset } = body;

    if (status === "done") {
      await completeTaskAndCancelReminders(taskId);
      return NextResponse.json({ success: true, status: "done" });
    }

    if (deadline !== undefined) {
      const result = await updateTaskDeadlineAndReminders(
        taskId,
        deadline,
        reminderOffset
      );
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

