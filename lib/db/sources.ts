import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import type { Dump, DumpKind } from "../data";

export type SourceProcessingStatus = "pending" | "processing" | "review" | "completed" | "failed";
export type SourceType = "text" | "audio" | "image" | "pdf";

export interface SourceDocument {
  _id: ObjectId;
  type: SourceType | "voice" | "screenshot";
  content: string;
  originalFileName?: string;
  mimeType?: string;
  createdAt: Date;
  processingStatus: SourceProcessingStatus;
  error?: string;
}

export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function mapSourceDocToDump(doc: SourceDocument, resultText?: string): Dump {
  const kindMap: Record<string, DumpKind> = {
    text: "Text",
    image: "Screenshot",
    screenshot: "Screenshot",
    pdf: "PDF",
    audio: "Voice",
    voice: "Voice",
  };

  const stateMap: Record<SourceProcessingStatus, "processing" | "review" | "processed"> = {
    pending: "processing",
    processing: "processing",
    review: "review",
    completed: "processed",
    failed: "processed",
  };

  const rawPreview = doc.content || doc.originalFileName || "Empty dump";
  const preview = rawPreview.length > 55 ? rawPreview.slice(0, 52) + "…" : rawPreview;

  return {
    id: doc._id.toString(),
    kind: kindMap[doc.type] || "Text",
    preview,
    time: formatTimeAgo(doc.createdAt),
    state: stateMap[doc.processingStatus] || "processed",
    result: resultText || (doc.processingStatus === "failed" ? "Failed to process" : "Processed"),
  };
}

export async function createSource(
  content: string,
  type: SourceType | "voice" | "screenshot" = "text",
  originalFileName?: string,
  mimeType?: string
): Promise<SourceDocument> {
  const db = await getDb();
  const collection = db.collection<SourceDocument>("sources");

  const doc: Omit<SourceDocument, "_id"> = {
    type,
    content,
    ...(originalFileName ? { originalFileName } : {}),
    ...(mimeType ? { mimeType } : {}),
    createdAt: new Date(),
    processingStatus: "pending",
  };

  const result = await collection.insertOne(doc as SourceDocument);
  return {
    ...doc,
    _id: result.insertedId,
  };
}

export async function updateSourceStatus(
  id: ObjectId | string,
  status: SourceProcessingStatus,
  error?: string
): Promise<void> {
  const db = await getDb();
  const collection = db.collection<SourceDocument>("sources");
  const filter = { _id: typeof id === "string" ? new ObjectId(id) : id };

  await collection.updateOne(filter, {
    $set: {
      processingStatus: status,
      ...(error ? { error } : {}),
    },
  });
}

export async function getDashboardDumps(): Promise<Dump[]> {
  try {
    const db = await getDb();
    const collection = db.collection<SourceDocument>("sources");
    const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map((doc) => mapSourceDocToDump(doc));
  } catch {
    return [];
  }
}

export function normalizeSourceType(type: string | undefined): "Text" | "Image" | "PDF" | "Audio" {
  if (!type) return "Text";
  const lower = type.toLowerCase();
  if (lower === "image" || lower === "screenshot") return "Image";
  if (lower === "pdf") return "PDF";
  if (lower === "audio" || lower === "voice") return "Audio";
  return "Text";
}

export function createSourceSnippet(content: string, maxLen: number = 140): string {
  if (!content) return "";
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + "…";
}

export async function getSourceById(id: ObjectId | string): Promise<SourceDocument | null> {
  try {
    const db = await getDb();
    const collection = db.collection<SourceDocument>("sources");
    const objId = typeof id === "string" ? new ObjectId(id) : id;
    return await collection.findOne({ _id: objId });
  } catch {
    return null;
  }
}
