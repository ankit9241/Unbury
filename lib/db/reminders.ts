import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import { APP_TIMEZONE } from "../date";

export interface ReminderDocument {
  _id: ObjectId;
  taskId: ObjectId;
  scheduledFor: Date;
  status: "pending" | "sent" | "cancelled";
  createdAt: Date;
  sentAt: Date | null;
  reminderOffset?: string;
  kind?: "primary" | "follow_up";
  parentReminderId?: ObjectId | string | null;
}

export function parseDeadlineDate(deadlineStr: string | null): Date | null {
  if (!deadlineStr) return null;
  const trimmed = deadlineStr.trim();
  if (!trimmed) return null;

  // Handle YYYY-MM-DD (date-only) by anchoring to 9:00 AM in app timezone
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    return new Date(`${trimmed}T09:00:00+05:30`);
  }

  // Handle "YYYY-MM-DD HH:mm" or "YYYY-MM-DD HH:mm:ss" without T/timezone
  const spaceTimeMatch = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (spaceTimeMatch) {
    const [, d, h, m, s = "00"] = spaceTimeMatch;
    return new Date(`${d}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}+05:30`);
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

export function calculateScheduledFor(
  deadlineStr: string | null,
  offsetStr: string | null | undefined
): Date | null {
  if (!deadlineStr || !offsetStr || offsetStr.trim().toLowerCase() === "none") {
    return null;
  }

  const deadlineDate = parseDeadlineDate(deadlineStr);
  if (!deadlineDate) return null;

  const lower = offsetStr.toLowerCase();
  let offsetMs = 0;

  const minMatch = /(\d+)\s*(?:min|minute)s?/i.exec(lower);
  const hourMatch = /(\d+)\s*(?:hour|hr)s?/i.exec(lower);
  const dayMatch = /(\d+)\s*days?/i.exec(lower);

  if (minMatch) {
    offsetMs = parseInt(minMatch[1], 10) * 60 * 1000;
  } else if (hourMatch) {
    offsetMs = parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
  } else if (dayMatch) {
    offsetMs = parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;
  } else if (lower.includes("15 min")) {
    offsetMs = 15 * 60 * 1000;
  } else if (lower.includes("1 hour") || lower.includes("1 hr")) {
    offsetMs = 60 * 60 * 1000;
  } else if (lower.includes("3 hour") || lower.includes("3 hr")) {
    offsetMs = 3 * 60 * 60 * 1000;
  } else if (lower.includes("1 day")) {
    offsetMs = 24 * 60 * 60 * 1000;
  } else if (lower.includes("3 day")) {
    offsetMs = 3 * 24 * 60 * 60 * 1000;
  } else {
    // Default standard offset
    offsetMs = 3 * 60 * 60 * 1000;
  }

  return new Date(deadlineDate.getTime() - offsetMs);
}

export function calculateFollowUpTime(
  deadlineStr: string | null,
  primaryScheduledFor: Date,
  now: Date = new Date()
): Date | null {
  if (!deadlineStr) return null;
  const deadlineDate = parseDeadlineDate(deadlineStr);
  if (!deadlineDate) return null;

  // follow-up = 1 hour before deadline
  const followUpDate = new Date(deadlineDate.getTime() - 60 * 60 * 1000);

  // If follow-up time is at or before the primary reminder
  if (followUpDate.getTime() <= primaryScheduledFor.getTime()) {
    return null;
  }

  // If follow-up time is at or after the deadline
  if (followUpDate.getTime() >= deadlineDate.getTime()) {
    return null;
  }

  // If follow-up time is already in the past
  if (followUpDate.getTime() <= now.getTime()) {
    return null;
  }

  return followUpDate;
}

export async function cancelPendingRemindersForTask(taskId: ObjectId | string): Promise<number> {
  const db = await getDb();
  const tId = typeof taskId === "string" ? new ObjectId(taskId) : taskId;
  const result = await db.collection<ReminderDocument>("reminders").updateMany(
    { taskId: tId, status: "pending" },
    { $set: { status: "cancelled" } }
  );
  return result.modifiedCount;
}

export async function scheduleReminderForTask(
  taskId: ObjectId | string,
  deadlineStr: string | null,
  offsetStr: string | null | undefined,
  followUpEnabled?: boolean
): Promise<{ primary: ReminderDocument | null; followUp: ReminderDocument | null }> {
  const tId = typeof taskId === "string" ? new ObjectId(taskId) : taskId;

  // Rule 3: No deadline = no reminder
  if (!deadlineStr || !offsetStr || offsetStr.trim().toLowerCase() === "none") {
    await cancelPendingRemindersForTask(tId);
    return { primary: null, followUp: null };
  }

  const scheduledFor = calculateScheduledFor(deadlineStr, offsetStr);
  if (!scheduledFor) {
    await cancelPendingRemindersForTask(tId);
    return { primary: null, followUp: null };
  }

  // Cancel any existing pending reminder first (preserving any already "sent" ones)
  await cancelPendingRemindersForTask(tId);

  const db = await getDb();
  const primaryDoc: ReminderDocument = {
    _id: new ObjectId(),
    taskId: tId,
    scheduledFor,
    status: "pending",
    createdAt: new Date(),
    sentAt: null,
    reminderOffset: offsetStr,
    kind: "primary",
    parentReminderId: null,
  };

  await db.collection<ReminderDocument>("reminders").insertOne(primaryDoc);

  let followUpDoc: ReminderDocument | null = null;
  if (followUpEnabled) {
    const followUpTime = calculateFollowUpTime(deadlineStr, scheduledFor);
    if (followUpTime) {
      followUpDoc = {
        _id: new ObjectId(),
        taskId: tId,
        scheduledFor: followUpTime,
        status: "pending",
        createdAt: new Date(),
        sentAt: null,
        reminderOffset: "1 hour before",
        kind: "follow_up",
        parentReminderId: primaryDoc._id,
      };
      await db.collection<ReminderDocument>("reminders").insertOne(followUpDoc);
    }
  }

  return { primary: primaryDoc, followUp: followUpDoc };
}

export async function updateTaskDeadlineAndReminders(
  taskId: ObjectId | string,
  newDeadline: string | null,
  reminderOffset?: string | null,
  followUpEnabled?: boolean
): Promise<{ updated: boolean; reminder: ReminderDocument | null; followUp?: ReminderDocument | null }> {
  const db = await getDb();
  const tId = typeof taskId === "string" ? new ObjectId(taskId) : taskId;

  const task = await db.collection("tasks").findOne({ _id: tId });
  if (!task) {
    return { updated: false, reminder: null, followUp: null };
  }

  const isFollowUp =
    followUpEnabled !== undefined
      ? followUpEnabled
      : Boolean((task as any).followUpEnabled);

  // Update task deadline in DB
  const now = new Date();
  await db.collection("tasks").updateOne(
    { _id: tId },
    {
      $set: {
        deadline: newDeadline || null,
        followUpEnabled: isFollowUp,
        updatedAt: now,
      },
    }
  );

  // If reminderOffset is not specified, inherit from existing task reminder or default
  const offset =
    reminderOffset !== undefined
      ? reminderOffset
      : task.reminders?.[0]?.label || "3 hours before";

  const { primary, followUp } = await scheduleReminderForTask(tId, newDeadline, offset, isFollowUp);
  return { updated: true, reminder: primary, followUp };
}

export async function completeTaskAndCancelReminders(
  taskId: ObjectId | string
): Promise<boolean> {
  const db = await getDb();
  const tId = typeof taskId === "string" ? new ObjectId(taskId) : taskId;

  await db.collection("tasks").updateOne(
    { _id: tId },
    {
      $set: {
        status: "done",
        updatedAt: new Date(),
      },
    }
  );

  await cancelPendingRemindersForTask(tId);
  return true;
}

export interface DueReminderWithTask {
  _id: string;
  taskId: string;
  scheduledFor: string;
  status: "pending" | "sent" | "cancelled";
  taskTitle: string;
  taskDeadline: string | null;
  reminderOffset?: string;
  kind?: "primary" | "follow_up";
}

export async function getDuePendingReminders(
  until: Date = new Date()
): Promise<DueReminderWithTask[]> {
  const db = await getDb();
  const reminders = await db
    .collection<ReminderDocument>("reminders")
    .find({
      status: "pending",
      scheduledFor: { $lte: until },
    })
    .sort({ scheduledFor: 1 })
    .toArray();

  if (reminders.length === 0) return [];

  const taskIds = reminders.map((r) => r.taskId);
  const tasks = await db
    .collection<{ _id: ObjectId; title: string; deadline: string | null; status: string }>("tasks")
    .find({ _id: { $in: taskIds } })
    .toArray();

  const taskMap = new Map(tasks.map((t) => [t._id.toString(), t]));

  const dueList: DueReminderWithTask[] = [];

  for (const r of reminders) {
    const task = taskMap.get(r.taskId.toString());
    const isCompleted = task?.status === "done";

    // Follow-up reminder:
    // before notifying, check the current task status.
    // if task is completed: cancel the follow-up, do NOT notify.
    if (r.kind === "follow_up") {
      if (isCompleted) {
        await db.collection<ReminderDocument>("reminders").updateOne(
          { _id: r._id },
          { $set: { status: "cancelled" } }
        );
        continue;
      }
    } else {
      if (isCompleted) {
        await db.collection<ReminderDocument>("reminders").updateOne(
          { _id: r._id },
          { $set: { status: "cancelled" } }
        );
        continue;
      }
    }

    dueList.push({
      _id: r._id.toString(),
      taskId: r.taskId.toString(),
      scheduledFor: r.scheduledFor.toISOString(),
      status: r.status,
      taskTitle: task ? task.title : "Task reminder",
      taskDeadline: task ? task.deadline : null,
      reminderOffset: r.reminderOffset,
      kind: r.kind || "primary",
    });
  }

  return dueList;
}

export async function markReminderAsSent(
  reminderId: ObjectId | string
): Promise<boolean> {
  const db = await getDb();
  let rId: ObjectId;
  try {
    rId = typeof reminderId === "string" ? new ObjectId(reminderId) : reminderId;
  } catch {
    return false;
  }

  const result = await db.collection<ReminderDocument>("reminders").updateOne(
    { _id: rId, status: "pending" },
    {
      $set: {
        status: "sent",
        sentAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}
