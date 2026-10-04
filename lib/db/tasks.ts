import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import type { Bucket, Priority, Reminder, Task } from "../data";
import { classifyDeadlineToBucket } from "../date";

export interface TaskDocument {
  _id: ObjectId;
  sourceId: ObjectId;
  title: string;
  description: string;
  deadline: string | null;
  priority: "low" | "medium" | "high";
  status: "not_started" | "in_progress" | "done";
  evidence: string;
  reminders?: Reminder[];
  followUpEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertTaskInput {
  sourceId: ObjectId | string;
  title: string;
  description?: string;
  deadline?: string | null;
  priority?: "low" | "medium" | "high";
  status?: "not_started" | "in_progress" | "done";
  evidence: string;
  reminders?: Reminder[];
  followUpEnabled?: boolean;
}

export function formatDeadline(deadlineStr: string | null): { when: string; bucket: Bucket } {
  return classifyDeadlineToBucket(deadlineStr);
}

import type { ConflictDocument } from "./conflicts";
import { type SourceDocument, normalizeSourceType, createSourceSnippet } from "./sources";

export function mapTaskDocToTask(
  doc: TaskDocument,
  conflictDoc?: ConflictDocument | null,
  sourceDoc?: SourceDocument | null
): Task {
  const { when, bucket } = classifyDeadlineToBucket(doc.deadline);

  const priorityMap: Record<string, Priority> = {
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  const statusMap: Record<string, "Not started" | "In progress" | "Done"> = {
    not_started: "Not started",
    in_progress: "In progress",
    done: "Done",
  };

  const capturedDate = doc.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const sourceType = normalizeSourceType(sourceDoc?.type);
  const sourcePreview = sourceDoc ? createSourceSnippet(sourceDoc.content) : undefined;

  const activeReminders: Reminder[] = doc.deadline
    ? doc.reminders && doc.reminders.length > 0
      ? doc.reminders
      : [{ label: "3 hours before", enabled: true }]
    : [];

  let conflict = undefined;
  if (conflictDoc && conflictDoc.status === "pending") {
    const currentWhen = doc.deadline ? classifyDeadlineToBucket(doc.deadline).when : "No deadline";
    const newWhen = conflictDoc.newDeadline
      ? classifyDeadlineToBucket(conflictDoc.newDeadline).when
      : "No deadline";

    conflict = {
      id: conflictDoc._id.toString(),
      currentDeadline: currentWhen !== "No deadline" ? currentWhen : conflictDoc.existingDeadline,
      newDeadline: newWhen !== "No deadline" ? newWhen : conflictDoc.newDeadline,
      currentEvidence: conflictDoc.existingEvidence,
      newEvidence: conflictDoc.newEvidence,
    };
  }

  return {
    id: doc._id.toString(),
    title: doc.title,
    deadline: doc.deadline || null,
    when,
    context: `${sourceType} dump`,
    bucket,
    priority: priorityMap[doc.priority] || "Medium",
    status: statusMap[doc.status] || "Not started",
    done: doc.status === "done",
    important: doc.priority === "high",
    why: doc.description || (doc.evidence ? `Remembered from: "${doc.evidence}"` : "Remembered by Unbury"),
    sourceId: doc.sourceId ? doc.sourceId.toString() : null,
    sourceType,
    sourcePreview,
    evidence: doc.evidence || undefined,
    source: {
      quote: doc.evidence,
      captured: `Captured from ${sourceType.toLowerCase()} · ${capturedDate}`,
      type: sourceType,
      preview: sourcePreview,
    },
    reminders: activeReminders,
    followUpEnabled: Boolean(doc.followUpEnabled),
    conflict,
  };
}

export async function insertTasks(items: InsertTaskInput[]): Promise<TaskDocument[]> {
  if (items.length === 0) return [];

  const db = await getDb();
  const collection = db.collection<TaskDocument>("tasks");

  const now = new Date();
  const docs: TaskDocument[] = items.map((item) => ({
    _id: new ObjectId(),
    sourceId: typeof item.sourceId === "string" ? new ObjectId(item.sourceId) : item.sourceId,
    title: item.title,
    description: item.description || "",
    deadline: item.deadline || null,
    priority: item.priority || "medium",
    status: item.status || "not_started",
    evidence: item.evidence,
    reminders: item.deadline ? item.reminders || [{ label: "3 hours before", enabled: true }] : [],
    followUpEnabled: Boolean(item.followUpEnabled),
    createdAt: now,
    updatedAt: now,
  }));

  await collection.insertMany(docs);
  return docs;
}

export async function getDashboardTasks(): Promise<Task[]> {
  try {
    const db = await getDb();
    const collection = db.collection<TaskDocument>("tasks");
    const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();

    const pendingConflicts = await db
      .collection<ConflictDocument>("conflicts")
      .find({ status: "pending" })
      .toArray();

    const conflictMap = new Map<string, ConflictDocument>();
    for (const c of pendingConflicts) {
      conflictMap.set(c.taskId.toString(), c);
    }

    const sourceIds = Array.from(new Set(docs.map((d) => d.sourceId).filter(Boolean)));
    const sources = sourceIds.length > 0
      ? await db.collection<SourceDocument>("sources").find({ _id: { $in: sourceIds } }).toArray()
      : [];

    const sourceMap = new Map<string, SourceDocument>();
    for (const s of sources) {
      sourceMap.set(s._id.toString(), s);
    }

    return docs.map((doc) =>
      mapTaskDocToTask(
        doc,
        conflictMap.get(doc._id.toString()),
        doc.sourceId ? sourceMap.get(doc.sourceId.toString()) : null
      )
    );
  } catch {
    return [];
  }
}
