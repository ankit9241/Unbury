import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import type { Memory } from "../data";

export type MemoryType = "person" | "deadline" | "context";

export interface MemoryDocument {
  _id: ObjectId;
  sourceId: ObjectId;
  type: MemoryType;
  title: string;
  content: string;
  evidence: string;
  createdAt: Date;
  taskId?: ObjectId | null;
}

export interface InsertMemoryInput {
  sourceId: ObjectId | string;
  type: MemoryType;
  title: string;
  content: string;
  evidence: string;
  taskId?: ObjectId | string | null;
}

import { type SourceDocument, normalizeSourceType, createSourceSnippet } from "./sources";
import type { TaskDocument } from "./tasks";

export interface MappedMemory extends Memory {
  type: MemoryType;
  evidence?: string;
  taskId?: string | null;
  taskTitle?: string | null;
  sourceId?: string;
  sourceType?: "Text" | "Image" | "PDF" | "Audio";
  sourcePreview?: string;
  createdAt?: string;
}

export type GroupedMemories = Record<"People" | "Deadlines" | "Context", MappedMemory[]>;

export function mapMemoryDocToMemory(
  doc: MemoryDocument,
  sourceDoc?: SourceDocument | null,
  taskTitle?: string | null
): MappedMemory {
  const meta = `Remembered ${doc.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const sourceType = normalizeSourceType(sourceDoc?.type);
  const sourcePreview = sourceDoc ? createSourceSnippet(sourceDoc.content) : undefined;

  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    detail: doc.content,
    meta,
    source: sourceType,
    sourceType,
    sourcePreview,
    evidence: doc.evidence || undefined,
    taskId: doc.taskId ? doc.taskId.toString() : null,
    taskTitle: taskTitle || null,
    sourceId: doc.sourceId ? doc.sourceId.toString() : undefined,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function insertMemories(items: InsertMemoryInput[]): Promise<MemoryDocument[]> {
  if (items.length === 0) return [];

  const db = await getDb();
  const collection = db.collection<MemoryDocument>("memories");

  const now = new Date();
  const docs: MemoryDocument[] = items.map((item) => ({
    _id: new ObjectId(),
    sourceId: typeof item.sourceId === "string" ? new ObjectId(item.sourceId) : item.sourceId,
    type: item.type,
    title: item.title,
    content: item.content,
    evidence: item.evidence,
    createdAt: now,
    taskId: item.taskId
      ? typeof item.taskId === "string"
        ? new ObjectId(item.taskId)
        : item.taskId
      : null,
  }));

  await collection.insertMany(docs);
  return docs;
}

export async function getMemories(filter?: {
  type?: string;
  taskId?: string;
}): Promise<MemoryDocument[]> {
  try {
    const db = await getDb();
    const collection = db.collection<MemoryDocument>("memories");
    const query: Record<string, unknown> = {};
    if (filter?.type) {
      query.type = filter.type;
    }
    if (filter?.taskId) {
      try {
        query.taskId = new ObjectId(filter.taskId);
      } catch {
        query.taskId = filter.taskId;
      }
    }
    return collection.find(query).sort({ createdAt: -1 }).toArray();
  } catch {
    return [];
  }
}

export async function populateMemoriesWithContext(docs: MemoryDocument[]): Promise<MappedMemory[]> {
  if (docs.length === 0) return [];
  const db = await getDb();
  const sourceIds = Array.from(new Set(docs.map((d) => d.sourceId).filter(Boolean)));
  const sources = sourceIds.length > 0
    ? await db.collection<SourceDocument>("sources").find({ _id: { $in: sourceIds } }).toArray()
    : [];
  const sourceMap = new Map<string, SourceDocument>();
  for (const s of sources) {
    sourceMap.set(s._id.toString(), s);
  }

  const taskIds = Array.from(new Set(docs.map((d) => d.taskId).filter((id): id is ObjectId => Boolean(id))));
  const tasks = taskIds.length > 0
    ? await db.collection<TaskDocument>("tasks").find({ _id: { $in: taskIds } }).toArray()
    : [];
  const taskMap = new Map<string, TaskDocument>();
  for (const t of tasks) {
    taskMap.set(t._id.toString(), t);
  }

  return docs.map((doc) => {
    const sourceDoc = doc.sourceId ? sourceMap.get(doc.sourceId.toString()) : undefined;
    const taskDoc = doc.taskId ? taskMap.get(doc.taskId.toString()) : undefined;
    return mapMemoryDocToMemory(doc, sourceDoc, taskDoc?.title);
  });
}

export async function getGroupedMemories(): Promise<GroupedMemories> {
  const docs = await getMemories();
  const mapped = await populateMemoriesWithContext(docs);
  const grouped: GroupedMemories = {
    People: [],
    Deadlines: [],
    Context: [],
  };

  for (const memory of mapped) {
    if (memory.type === "person") {
      grouped.People.push(memory);
    } else if (memory.type === "deadline") {
      grouped.Deadlines.push(memory);
    } else {
      grouped.Context.push(memory);
    }
  }

  return grouped;
}


