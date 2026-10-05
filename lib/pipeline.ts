import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import { createSource, updateSourceStatus, mapSourceDocToDump, type SourceDocument, type SourceType } from "./db/sources";
import { insertTasks, mapTaskDocToTask, type InsertTaskInput } from "./db/tasks";
import { insertMemories, mapMemoryDocToMemory, type InsertMemoryInput } from "./db/memories";
import { scheduleReminderForTask } from "./db/reminders";
import { findMatchingTask, deadlinesDiffer, createConflict, type ConflictDocument } from "./db/conflicts";
import { extractFromText, cleanTaskTitle } from "./ai/gemma";
import type { ExtractedTask, ExtractedMemory } from "./ai/extraction-schema";
import { classifyDeadlineToBucket, deadlineHasTime, parseReminderOffset } from "./date";
import type { Bucket, Dump, Priority, Reminder, Task } from "./data";
import type { MappedMemory } from "./db/memories";

export interface ProcessDumpOptions {
  content: string;
  sourceType: SourceType;
  originalFileName?: string;
  mimeType?: string;
}

export interface ProposedTask {
  tempId: string;
  title: string;
  description: string;
  deadline: string | null;
  when: string;
  bucket: Bucket;
  priority: Priority;
  evidence: string;
  suggestedReminder: string | null;
  reminder: string | null;
  remindersEnabled: boolean;
  followUpEnabled?: boolean;
}

export interface ProposedMemory {
  tempId: string;
  type: "person" | "deadline" | "context";
  title: string;
  content: string;
  evidence: string;
  enabled: boolean;
}

export interface DumpProposal {
  sourceId: string;
  source: Dump;
  tasks: ProposedTask[];
  memories: ProposedMemory[];
  rawContent: string;
}

export interface ProposalResponse {
  success: true;
  isProposal: true;
  proposal: DumpProposal;
}

export interface CompletedResponse {
  success: true;
  isProposal: false;
  source: Dump;
  tasks: Task[];
  memories: MappedMemory[];
  count: number;
}

export type ProcessDumpResponse = ProposalResponse | CompletedResponse;

export async function processDump(options: ProcessDumpOptions): Promise<ProcessDumpResponse> {
  const { content, sourceType, originalFileName, mimeType } = options;

  const source = await createSource(content, sourceType, originalFileName, mimeType);

  try {
    await updateSourceStatus(source._id, "processing");

    if (!content.trim()) {
      await updateSourceStatus(source._id, "completed");
      const formattedSource = mapSourceDocToDump(source, "0 things found");
      return {
        success: true,
        isProposal: false,
        source: formattedSource,
        tasks: [],
        memories: [],
        count: 0,
      };
    }

    const extraction = await extractFromText(content);

    // If completely non-actionable (0 tasks and 0 memories), finish immediately with 0 items
    if (extraction.tasks.length === 0 && extraction.memories.length === 0) {
      await updateSourceStatus(source._id, "completed");
      const formattedSource = mapSourceDocToDump(source, "0 things found");
      return {
        success: true,
        isProposal: false,
        source: formattedSource,
        tasks: [],
        memories: [],
        count: 0,
      };
    }

    // Build proposed tasks without persisting them
    const proposedTasks: ProposedTask[] = extraction.tasks.map((t: ExtractedTask, index: number) => {
      const { when, bucket } = classifyDeadlineToBucket(t.deadline);
      const priorityMap: Record<string, Priority> = {
        high: "High",
        medium: "Medium",
        low: "Low",
      };

      const hasDeadline = Boolean(t.deadline);
      const hasTime = deadlineHasTime(t.deadline);

      let explicitOffset = parseReminderOffset(t.evidence);
      if (!explicitOffset && extraction.tasks.length === 1) {
        explicitOffset = parseReminderOffset(content);
      }
      if (!explicitOffset) {
        explicitOffset = parseReminderOffset(t.description) || parseReminderOffset(t.title);
      }
      if (!explicitOffset) {
        // Protect a.m./p.m. before splitting so clock times don't split sentences
        const normalizedContent = content.replace(/\b([ap])\.m\./gi, "$1m");
        const sentences = normalizedContent.split(/(?<=[.?!;\n])\s+/).map((s) => s.trim()).filter(Boolean);
        const evNorm = t.evidence.toLowerCase().replace(/\b([ap])\.m\./gi, "$1m");
        const titleNorm = t.title.toLowerCase();
        const sentenceIdx = sentences.findIndex(
          (s) => {
            const sLower = s.toLowerCase();
            return (
              (evNorm && (sLower.includes(evNorm) || evNorm.includes(sLower))) ||
              (titleNorm && sLower.includes(titleNorm))
            );
          }
        );
        if (sentenceIdx !== -1) {
          explicitOffset =
            parseReminderOffset(sentences[sentenceIdx]) ||
            (sentenceIdx + 1 < sentences.length ? parseReminderOffset(sentences[sentenceIdx + 1]) : null) ||
            (sentenceIdx - 1 >= 0 ? parseReminderOffset(sentences[sentenceIdx - 1]) : null);
        }
      }

      let suggestedReminder: string | null = null;
      let remindersEnabled = false;

      if (explicitOffset) {
        suggestedReminder = explicitOffset;
        remindersEnabled = true;
      } else if (hasDeadline && hasTime) {
        suggestedReminder = "3 hours before";
        remindersEnabled = true;
      } else {
        suggestedReminder = null;
        remindersEnabled = false;
      }

      return {
        tempId: `task-${Date.now()}-${index}`,
        title: cleanTaskTitle(t.title, t.deadline),
        description: t.description || "",
        deadline: t.deadline,
        when,
        bucket,
        priority: priorityMap[t.priority] || "Medium",
        evidence: t.evidence,
        suggestedReminder,
        reminder: suggestedReminder,
        remindersEnabled,
      };
    });

    // Build proposed memories without persisting them
    const proposedMemories: ProposedMemory[] = extraction.memories.map((m: ExtractedMemory, index: number) => ({
      tempId: `mem-${Date.now()}-${index}`,
      type: m.type,
      title: m.title,
      content: m.content,
      evidence: m.evidence,
      enabled: true,
    }));

    await updateSourceStatus(source._id, "review");

    const taskCount = proposedTasks.length;
    const resultLabel =
      taskCount > 0
        ? `${taskCount} task${taskCount === 1 ? "" : "s"} suggested`
        : `${proposedMemories.length} item${proposedMemories.length === 1 ? "" : "s"} noticed`;

    const formattedSource = mapSourceDocToDump(source, resultLabel);

    return {
      success: true,
      isProposal: true,
      proposal: {
        sourceId: source._id.toString(),
        source: formattedSource,
        tasks: proposedTasks,
        memories: proposedMemories,
        rawContent: content,
      },
    };
  } catch (err) {
    await updateSourceStatus(
      source._id,
      "failed",
      err instanceof Error ? err.message : "Processing error"
    ).catch(() => {});
    throw err;
  }
}

export interface ConfirmProposalInput {
  sourceId: string;
  tasks: Array<{
    title: string;
    description?: string;
    deadline?: string | null;
    priority?: Priority;
    evidence: string;
    reminder?: string | null;
    followUpEnabled?: boolean;
  }>;
  memories: Array<{
    type: "person" | "deadline" | "context";
    title: string;
    content: string;
    evidence: string;
  }>;
}

export async function confirmProposal(input: ConfirmProposalInput) {
  const { sourceId, tasks: confirmedTasks, memories: confirmedMemories } = input;

  const db = await getDb();
  let objId: ObjectId;
  try {
    objId = new ObjectId(sourceId);
  } catch {
    throw new Error("Invalid sourceId");
  }

  const sourceDoc = await db.collection<SourceDocument>("sources").findOne({ _id: objId });
  if (!sourceDoc) {
    throw new Error("Source not found");
  }

  const normalTaskInputs: InsertTaskInput[] = [];
  const createdConflicts: ConflictDocument[] = [];

  for (const t of confirmedTasks) {
    const rawPriority = (t.priority || "Medium").toLowerCase();
    const priority = rawPriority === "high" || rawPriority === "low" ? rawPriority : "medium";
    const deadline = t.deadline && t.deadline.trim() ? t.deadline.trim() : null;

    if (deadline) {
      const existingTask = await findMatchingTask(t.title);
      if (existingTask && existingTask.deadline && deadlinesDiffer(existingTask.deadline, deadline)) {
        const conflictDoc = await createConflict({
          taskId: existingTask._id,
          existingDeadline: existingTask.deadline,
          existingEvidence: existingTask.evidence,
          newDeadline: deadline,
          newEvidence: t.evidence,
          sourceId: sourceDoc._id,
        });
        createdConflicts.push(conflictDoc);
        continue;
      }
    }

    const hasTime = deadlineHasTime(deadline);
    const reminders: Reminder[] =
      deadline && hasTime && t.reminder && t.reminder !== "None"
        ? t.followUpEnabled
          ? [
              { label: t.reminder, enabled: true, kind: "primary" },
              { label: "1 hour before", enabled: true, kind: "follow_up" },
            ]
          : [{ label: t.reminder, enabled: true, kind: "primary" }]
        : [];

    normalTaskInputs.push({
      sourceId: sourceDoc._id,
      title: t.title.trim(),
      description: t.description || "",
      deadline,
      priority,
      status: "not_started",
      evidence: t.evidence,
      reminders,
      followUpEnabled: Boolean(t.followUpEnabled),
    });
  }

  // 1. Create tasks first and capture their generated IDs
  const savedTasks = await insertTasks(normalTaskInputs);

  // 2. Deterministically attach taskId if exactly one task was created from this source
  const attachedTaskId =
    savedTasks.length === 1
      ? savedTasks[0]._id
      : createdConflicts.length === 1 && savedTasks.length === 0
        ? createdConflicts[0].taskId
        : null;

  const memoryInputs: InsertMemoryInput[] = confirmedMemories.map((m) => ({
    sourceId: sourceDoc._id,
    type: m.type,
    title: m.title.trim(),
    content: m.content.trim(),
    evidence: m.evidence,
    taskId: attachedTaskId,
  }));

  // 3. Persist memories afterward
  const savedMemories = await insertMemories(memoryInputs);

  // Schedule concrete reminders for confirmed tasks that have a deadline & reminder
  await Promise.all(
    savedTasks.map(async (taskDoc) => {
      const reminderOffset = taskDoc.reminders?.[0]?.label;
      if (taskDoc.deadline && deadlineHasTime(taskDoc.deadline) && reminderOffset && reminderOffset !== "None") {
        await scheduleReminderForTask(
          taskDoc._id,
          taskDoc.deadline,
          reminderOffset,
          Boolean(taskDoc.followUpEnabled)
        );
      }
    })
  );

  await updateSourceStatus(sourceDoc._id, "completed");

  const totalCount = savedTasks.length + savedMemories.length + createdConflicts.length;
  const resultText =
    savedTasks.length > 0
      ? `${savedTasks.length} task${savedTasks.length === 1 ? "" : "s"} confirmed`
      : createdConflicts.length > 0
        ? "1 conflict noticed"
        : `${savedMemories.length} item${savedMemories.length === 1 ? "" : "s"} confirmed`;
  const formattedSource = mapSourceDocToDump(sourceDoc, resultText);

  const linkedTaskTitle = attachedTaskId
    ? savedTasks.find((t) => t._id.equals(attachedTaskId))?.title || null
    : null;

  return {
    success: true,
    source: formattedSource,
    tasks: savedTasks.map((doc) => mapTaskDocToTask(doc, undefined, sourceDoc)),
    memories: savedMemories.map((doc) => mapMemoryDocToMemory(doc, sourceDoc, linkedTaskTitle)),
    count: totalCount,
  };
}

export async function discardProposal(sourceId: string) {
  const db = await getDb();
  try {
    const objId = new ObjectId(sourceId);
    await db.collection("sources").deleteOne({ _id: objId });
  } catch {}
  return { success: true };
}
