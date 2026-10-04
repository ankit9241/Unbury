import { NextResponse } from "next/server";
import { getDuePendingReminders, markReminderAsSent } from "@/lib/db/reminders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reminders = await getDuePendingReminders();
    return NextResponse.json({ reminders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch due reminders";
    return NextResponse.json({ error: message, reminders: [] }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.reminderId) {
      return NextResponse.json({ error: "Missing reminderId." }, { status: 400 });
    }

    const updated = await markReminderAsSent(body.reminderId);
    return NextResponse.json({ success: true, updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update reminder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
