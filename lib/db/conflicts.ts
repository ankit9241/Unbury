import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import type { TaskDocument } from "./tasks";
import { updateTaskDeadlineAndReminders } from "./reminders";

export interface ConflictDocument {
  _id: ObjectId;
  taskId: ObjectId;
  existingDeadline: string;
  existingEvidence: string;
  newDeadline: string;
  newEvidence: string;
  sourceId: ObjectId;
  status: "pending" | "resolved";
  createdAt: Date;
  resolvedAt?: Date | null;
}

export function normalizeTaskTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deadlinesDiffer(
  d1: string | null | undefined,
  d2: string | null | undefined
): boolean {
  if (!d1 || !d2) return false;
  const s1 = d1.trim();
  const s2 = d2.trim();
  if (s1 === s2) return false;

  const t1 = Date.parse(s1);
  const t2 = Date.parse(s2);
  if (!isNaN(t1) && !isNaN(t2)) {
    return t1 !== t2;
  }
  return true;
}

export async function findMatchingTask(title: string): Promise<TaskDocument | null> {
  const normalized = normalizeTaskTitle(title);
  if (!normalized) return null;

  const db = await getDb();
  const tasks = await db
    .collection<TaskDocument>("tasks")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  // Prefer active tasks first
  for (const t of tasks) {
    if (t.status !== "done" && normalizeTaskTitle(t.title) === normalized) {
      return t;
    }
  }

  // Fallback to any matching task
  for (const t of tasks) {
    if (normalizeTaskTitle(t.title) === normalized) {
      return t;
    }
  }

  return null;
}

export async function createConflict(input: {
  taskId: ObjectId | string;
  existingDeadline: string;
  existingEvidence: string;
  newDeadline: string;
  newEvidence: string;
  sourceId: ObjectId | string;
}): Promise<ConflictDocument> {
  const db = await getDb();
  const doc: ConflictDocument = {
    _id: new ObjectId(),
    taskId: typeof input.taskId === "string" ? new ObjectId(input.taskId) : input.taskId,
    existingDeadline: input.existingDeadline,
    existingEvidence: input.existingEvidence,
    newDeadline: input.newDeadline,
    newEvidence: input.newEvidence,
    sourceId: typeof input.sourceId === "string" ? new ObjectId(input.sourceId) : input.sourceId,
    status: "pending",
    createdAt: new Date(),
    resolvedAt: null,
  };

  await db.collection<ConflictDocument>("conflicts").insertOne(doc);
  return doc;
}

export async function getPendingConflicts(): Promise<ConflictDocument[]> {
  const db = await getDb();
  return db
    .collection<ConflictDocument>("conflicts")
    .find({ status: "pending" })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function resolveConflictAcceptNew(conflictId: ObjectId | string): Promise<{
  conflict: ConflictDocument;
  task: TaskDocument;
}> {
  const db = await getDb();
  const cId = typeof conflictId === "string" ? new ObjectId(conflictId) : conflictId;

  const conflict = await db.collection<ConflictDocument>("conflicts").findOne({ _id: cId });
  if (!conflict) {
    throw new Error("Conflict not found");
  }

  if (conflict.status === "resolved") {
    throw new Error("Conflict is already resolved");
  }

  const task = await db.collection<TaskDocument>("tasks").findOne({ _id: conflict.taskId });
  if (!task) {
    throw new Error("Associated task not found");
  }

  // 1. Preserve existing and new evidence
  const existingEv = (task.evidence || conflict.existingEvidence || "").trim();
  const newEv = (conflict.newEvidence || "").trim();
  let combinedEvidence = existingEv;
  if (newEv && !existingEv.includes(newEv)) {
    combinedEvidence = existingEv ? `${existingEv}\n${newEv}` : newEv;
  }

  const now = new Date();
  await db.collection<TaskDocument>("tasks").updateOne(
    { _id: task._id },
    {
      $set: {
        evidence: combinedEvidence,
        updatedAt: now,
      },
    }
  );

  // 2. Reuse the existing reminder deadline-update logic so pending reminders are recalculated correctly
  await updateTaskDeadlineAndReminders(task._id, conflict.newDeadline);

  // 3. Mark conflict resolved
  await db.collection<ConflictDocument>("conflicts").updateOne(
    { _id: conflict._id },
    {
      $set: {
        status: "resolved",
        resolvedAt: now,
      },
    }
  );

  const updatedConflict: ConflictDocument = {
    ...conflict,
    status: "resolved",
    resolvedAt: now,
  };
  const updatedTask = (await db.collection<TaskDocument>("tasks").findOne({ _id: task._id }))!;

  return { conflict: updatedConflict, task: updatedTask };
}
