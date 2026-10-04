import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDashboardTasks, updateTaskDetails, deleteTask } from "@/lib/db/tasks";
import { completeTaskAndCancelReminders } from "@/lib/db/reminders";

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
    if (!body || !body.taskId || !ObjectId.isValid(body.taskId)) {
      return NextResponse.json(
        { error: "Valid taskId is required in request body." },
        { status: 400 }
      );
    }

    const { taskId, deadline, status, reminderOffset, title, description } = body;

    if (status === "done") {
      await completeTaskAndCancelReminders(taskId);
      if (title !== undefined || description !== undefined) {
        await updateTaskDetails(taskId, { title, description });
      }
      return NextResponse.json({ success: true, status: "done" });
    }

    const updatedTask = await updateTaskDetails(taskId, {
      title,
      description,
      deadline,
      reminderOffset,
      status: status && ["not_started", "in_progress"].includes(status) ? status : undefined,
    });

    if (!updatedTask) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    let taskId: string | null = null;
    const { searchParams } = new URL(request.url);
    taskId = searchParams.get("taskId");

    if (!taskId) {
      try {
        const body = await request.json();
        taskId = body?.taskId;
      } catch {
        // empty body
      }
    }

    if (!taskId || !ObjectId.isValid(taskId)) {
      return NextResponse.json(
        { error: "Valid taskId is required." },
        { status: 400 }
      );
    }

    const success = await deleteTask(taskId);
    if (!success) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, taskId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
