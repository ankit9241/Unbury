import { NextResponse } from "next/server";
import { getDuePendingReminders, markReminderAsSent } from "@/lib/db/reminders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reminders = await getDuePendingReminders();
    console.log("[api/reminders] GET due reminders:", {
      serverTime: new Date().toISOString(),
      count: reminders.length,
      reminders: reminders.map((r) => ({
        id: r._id,
        title: r.taskTitle,
        scheduledFor: r.scheduledFor,
        status: r.status,
      })),
    });
    return NextResponse.json({ reminders });
  } catch (err: unknown) {
    console.error("Reminders retrieval error:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Failed to fetch due reminders.", reminders: [] }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.reminderId) {
      return NextResponse.json({ error: "Missing reminderId." }, { status: 400 });
    }

    const updated = await markReminderAsSent(body.reminderId);
    console.log("[api/reminders] PATCH reminder marked as sent:", {
      reminderId: body.reminderId,
      updated,
      time: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, updated });
  } catch (err: unknown) {
    console.error("Reminder update error:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Failed to update reminder. Please try again." }, { status: 500 });
  }
}
