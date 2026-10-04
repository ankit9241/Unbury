import fs from "fs";
import path from "path";

// 1. Ensure environment variables are loaded
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

import { getDb } from "@/lib/mongodb";
import {
  processDump,
  confirmProposal,
  type ProcessDumpResponse,
  type ProposedTask,
  type ProposedMemory,
} from "@/lib/pipeline";
import type { Task } from "@/lib/data";
import type { MappedMemory } from "@/lib/db/memories";

interface TestCaseResult {
  id: number;
  name: string;
  passed: boolean;
  notes: string[];
  mismatches: string[];
}

function getTasks(res: ProcessDumpResponse): Array<{ title: string; deadline?: string | null; evidence?: string; when?: string }> {
  if (res.isProposal) {
    return res.proposal.tasks;
  }
  return res.tasks;
}

function getMemories(res: ProcessDumpResponse): Array<{ title: string; content?: string }> {
  if (res.isProposal) {
    return res.proposal.memories;
  }
  return res.memories;
}

export async function runFriendTests(): Promise<TestCaseResult[]> {
  const db = await getDb();
  const testRunId = `FT_${Date.now()}`;
  const results: TestCaseResult[] = [];

  console.log(`\n======================================================`);
  console.log(` Starting Unbury "Friend Testing" Suite (${testRunId})`);
  console.log(`======================================================\n`);

  function record(id: number, name: string, mismatches: string[], notes: string[]) {
    const passed = mismatches.length === 0;
    results.push({ id, name, passed, notes, mismatches });
    const status = passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    console.log(`[Case ${id.toString().padStart(2, "0")}] ${name} -> ${status}`);
    if (notes.length > 0) {
      notes.forEach((n) => console.log(`   ℹ ${n}`));
    }
    if (!passed) {
      mismatches.forEach((m) => console.log(`   ❌ ${m}`));
    }
    console.log();
  }

  try {
    // ----------------------------------------------------
    // CASE 1: WhatsApp-style message with one clear task + deadline
    // ----------------------------------------------------
    {
      const id = 1;
      const name = "WhatsApp message: one clear task + deadline";
      const content = `[${testRunId}] Hey, can you please submit the DBMS assignment by Sunday at 11:59 PM?`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "text" });
      if (!res.isProposal) {
        mismatches.push("Expected proposal with review required, got isProposal=false");
      } else {
        const tasks = res.proposal.tasks;
        if (tasks.length !== 1) {
          mismatches.push(`Expected exactly 1 task, found ${tasks.length}`);
        } else {
          const task = tasks[0];
          notes.push(`Task extracted: "${task.title}"`);
          notes.push(`Deadline: "${task.deadline}" (${task.when})`);
          notes.push(`Evidence: "${task.evidence}"`);

          const titleLower = task.title.toLowerCase();
          if (!titleLower.includes("assignment") && !titleLower.includes("dbms")) {
            mismatches.push(`Task title does not mention assignment or DBMS: "${task.title}"`);
          }
          if (!task.deadline) {
            mismatches.push("Expected deadline to be extracted, got null");
          }
          if (!task.evidence || !content.includes(task.evidence)) {
            mismatches.push(`Evidence was missing or not from source: "${task.evidence}"`);
          }
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 2: WhatsApp conversation with multiple people but no task
    // ----------------------------------------------------
    {
      const id = 2;
      const name = "WhatsApp conversation: multiple people, zero tasks";
      const content = `[${testRunId}]
Rohan: Are we meeting at the cafe later?
Priya: No, I have to pick up my sister from the airport.
Rohan: Okay cool, let's catch up tomorrow then!
Sneha: Have fun guys!`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "text" });
      const tasks = getTasks(res);
      const memories = getMemories(res);

      if (tasks.length > 0) {
        mismatches.push(`Expected 0 tasks from casual conversation, but got ${tasks.length}: ${tasks.map((t) => t.title).join(", ")}`);
      } else {
        notes.push("Correctly extracted 0 tasks");
        if (memories.length > 0) {
          notes.push(`Extracted ${memories.length} people/context memories without creating tasks`);
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 3: Screenshot containing a task mixed with timestamps/UI noise
    // ----------------------------------------------------
    {
      const id = 3;
      const name = "Screenshot: task mixed with timestamps & UI noise";
      const content = `[${testRunId}]
LTE 84% 10:42 PM
< Back Chat
Today 10:41 PM
From: Manager Alex
Team, please upload the quarterly budget spreadsheet tomorrow by 5 PM sharp.
Read 10:42 PM
[Type a message...]`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "image" });
      if (!res.isProposal) {
        mismatches.push("Expected proposal with review required");
      } else {
        const tasks = res.proposal.tasks;
        if (tasks.length !== 1) {
          mismatches.push(`Expected 1 task, found ${tasks.length}`);
        } else {
          const task = tasks[0];
          notes.push(`Task title: "${task.title}"`);
          notes.push(`Deadline: "${task.deadline}"`);
          const titleLower = task.title.toLowerCase();
          if (titleLower.includes("lte") || titleLower.includes("84%") || titleLower.includes("10:42")) {
            mismatches.push(`Task title contains UI clutter or status noise: "${task.title}"`);
          }
          if (!titleLower.includes("upload") && !titleLower.includes("budget") && !titleLower.includes("spreadsheet")) {
            mismatches.push(`Task title missing core action: "${task.title}"`);
          }
          if (!task.deadline) {
            mismatches.push("Expected deadline 'tomorrow by 5 PM' to be extracted");
          }
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 4: Screenshot containing a task with an ambiguous deadline
    // ----------------------------------------------------
    {
      const id = 4;
      const name = "Screenshot: task with ambiguous deadline (no fabricated time)";
      const content = `[${testRunId}]
Battery 15% 3:15 PM
Prof. Miller: Don't forget to review chapter 4 sometime next week.`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "image" });
      if (!res.isProposal) {
        mismatches.push("Expected proposal with review required");
      } else {
        const tasks = res.proposal.tasks;
        if (tasks.length !== 1) {
          mismatches.push(`Expected 1 task, found ${tasks.length}`);
        } else {
          const task = tasks[0];
          notes.push(`Task title: "${task.title}"`);
          notes.push(`Deadline: "${task.deadline}" (${task.when})`);
          const titleLower = task.title.toLowerCase();
          if (!titleLower.includes("review") || !titleLower.includes("chapter 4")) {
            mismatches.push(`Task title did not match expected action: "${task.title}"`);
          }
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 5: PDF/text containing multiple deadlines
    // ----------------------------------------------------
    {
      const id = 5;
      const name = "PDF/text: multiple tasks with distinct deadlines";
      const content = `[${testRunId}]
Course Syllabus CS301
Important Due Dates:
1. Submit Milestone 1 architecture plan by October 10 at 5:00 PM.
2. Submit Milestone 2 implementation code by October 24 at 5:00 PM.
Instructor: Dr. Vance`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "pdf" });
      if (!res.isProposal) {
        mismatches.push("Expected proposal with review required");
      } else {
        const tasks = res.proposal.tasks;
        if (tasks.length < 2) {
          mismatches.push(`Expected at least 2 tasks with deadlines, found ${tasks.length}`);
        } else {
          notes.push(`Found ${tasks.length} tasks:`);
          tasks.forEach((t) => notes.push(` - "${t.title}" (Deadline: ${t.deadline})`));
          const allHaveDeadlines = tasks.every((t) => Boolean(t.deadline));
          if (!allHaveDeadlines) {
            mismatches.push("Not all extracted tasks have deadlines");
          }
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 6: Audio transcription containing a reminder request
    // ----------------------------------------------------
    {
      const id = 6;
      const name = "Audio transcription: reminder request";
      const content = `[${testRunId}] [Voice Note Transcription - 0:14] Hey, um, remind me to call the electrician tomorrow morning around 10 AM to fix the kitchen switch.`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "audio" });
      if (!res.isProposal) {
        mismatches.push("Expected proposal with review required");
      } else {
        const tasks = res.proposal.tasks;
        if (tasks.length !== 1) {
          mismatches.push(`Expected 1 task, found ${tasks.length}`);
        } else {
          const task = tasks[0];
          notes.push(`Task title: "${task.title}"`);
          notes.push(`Deadline: "${task.deadline}"`);
          notes.push(`Suggested reminder: "${task.suggestedReminder}"`);
          const titleLower = task.title.toLowerCase();
          if (!titleLower.includes("call") || !titleLower.includes("electrician")) {
            mismatches.push(`Task title missing expected action: "${task.title}"`);
          }
          if (!task.deadline) {
            mismatches.push("Expected deadline for 'tomorrow morning around 10 AM'");
          }
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 7: Message containing a date but no actionable task
    // ----------------------------------------------------
    {
      const id = 7;
      const name = "Informative status with date, zero tasks";
      const content = `[${testRunId}] Just letting you know our flight landed in Delhi on October 2nd. The weather here is nice and sunny.`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "text" });
      const tasks = getTasks(res);
      if (tasks.length > 0) {
        mismatches.push(`Expected 0 tasks, but extracted: ${tasks.map((t) => t.title).join(", ")}`);
      } else {
        notes.push("Correctly recognized message as informative with 0 tasks");
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 8: Message containing an actionable task but no deadline
    // ----------------------------------------------------
    {
      const id = 8;
      const name = "Actionable task without deadline";
      const content = `[${testRunId}] Hey, please buy some oat milk and bananas whenever you head to the grocery store.`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "text" });
      if (!res.isProposal) {
        mismatches.push("Expected proposal with review required");
      } else {
        const tasks = res.proposal.tasks;
        if (tasks.length !== 1) {
          mismatches.push(`Expected 1 task, found ${tasks.length}`);
        } else {
          const task = tasks[0];
          notes.push(`Task title: "${task.title}"`);
          notes.push(`Deadline: ${task.deadline === null ? "null (No deadline)" : task.deadline}`);
          const titleLower = task.title.toLowerCase();
          if (!titleLower.includes("buy") || (!titleLower.includes("milk") && !titleLower.includes("banana"))) {
            mismatches.push(`Task title does not match action: "${task.title}"`);
          }
          if (task.deadline !== null && task.when !== "No deadline") {
            mismatches.push(`Expected no deadline, but got fabricated deadline: "${task.deadline}"`);
          }
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 9: Two messages that create a deadline conflict for the same task
    // ----------------------------------------------------
    {
      const id = 9;
      const name = "Two messages creating deadline conflict for same task";
      const mismatches: string[] = [];
      const notes: string[] = [];

      const title = `Submit Final Research Paper ${testRunId}`;
      const dump1 = `[${testRunId}] Please ${title} by Friday at 5 PM.`;
      const dump2 = `[${testRunId}] The professor extended the deadline: ${title} by Monday at 6 PM.`;

      // Process and confirm Dump 1
      const res1 = await processDump({ content: dump1, sourceType: "text" });
      if (!res1.isProposal || res1.proposal.tasks.length === 0) {
        mismatches.push("Failed to extract initial task from dump 1");
      } else {
        const t1 = res1.proposal.tasks[0];
        const confirmRes1 = await confirmProposal({
          sourceId: res1.proposal.sourceId,
          tasks: [
            {
              title,
              deadline: t1.deadline || "Friday at 5 PM",
              evidence: t1.evidence,
              priority: t1.priority,
            },
          ],
          memories: [],
        });

        notes.push(`Initial task persisted: "${confirmRes1.tasks[0]?.title}" with deadline: "${confirmRes1.tasks[0]?.deadline}"`);

        // Process and confirm Dump 2 with different deadline
        const res2 = await processDump({ content: dump2, sourceType: "text" });
        if (!res2.isProposal || res2.proposal.tasks.length === 0) {
          mismatches.push("Failed to extract updated task from dump 2");
        } else {
          const t2 = res2.proposal.tasks[0];
          await confirmProposal({
            sourceId: res2.proposal.sourceId,
            tasks: [
              {
                title,
                deadline: t2.deadline || "Monday at 6 PM",
                evidence: t2.evidence,
                priority: t2.priority,
              },
            ],
            memories: [],
          });

          // Check if conflict was recorded
          const taskDoc = await db.collection("tasks").findOne({ title });
          const conflictDoc = taskDoc
            ? await db.collection("conflicts").findOne({ taskId: taskDoc._id, status: "pending" })
            : null;

          if (!conflictDoc) {
            mismatches.push(`Expected conflict to be detected for "${title}", but none found`);
          } else {
            notes.push(`Conflict detected successfully!`);
            notes.push(`Existing deadline: "${conflictDoc.existingDeadline}" | New deadline: "${conflictDoc.newDeadline}"`);
            notes.push(`Existing evidence: "${conflictDoc.existingEvidence}"`);
            notes.push(`New evidence: "${conflictDoc.newEvidence}"`);
          }
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 10: Duplicate/repeated request for the same task
    // ----------------------------------------------------
    {
      const id = 10;
      const name = "Duplicate request with identical deadline (no false conflict)";
      const mismatches: string[] = [];
      const notes: string[] = [];

      const title = `Pay Electricity Bill ${testRunId}`;
      const dump1 = `[${testRunId}] Don't forget to ${title} tomorrow by 6 PM.`;
      const dump2 = `[${testRunId}] Reminder: please ${title} tomorrow by 6 PM.`;

      const res1 = await processDump({ content: dump1, sourceType: "text" });
      if (!res1.isProposal || res1.proposal.tasks.length === 0) {
        mismatches.push("Failed to extract initial task from dump 1");
      } else {
        const t1 = res1.proposal.tasks[0];
        await confirmProposal({
          sourceId: res1.proposal.sourceId,
          tasks: [
            {
              title,
              deadline: t1.deadline || "Tomorrow · 6:00 PM",
              evidence: t1.evidence,
              priority: t1.priority,
            },
          ],
          memories: [],
        });

        // Second identical dump
        const res2 = await processDump({ content: dump2, sourceType: "text" });
        if (res2.isProposal && res2.proposal.tasks.length > 0) {
          const t2 = res2.proposal.tasks[0];
          await confirmProposal({
            sourceId: res2.proposal.sourceId,
            tasks: [
              {
                title,
                deadline: t2.deadline || t1.deadline,
                evidence: t2.evidence,
                priority: t2.priority,
              },
            ],
            memories: [],
          });

          const taskDoc = await db.collection("tasks").findOne({ title });
          const conflictDoc = taskDoc
            ? await db.collection("conflicts").findOne({ taskId: taskDoc._id, status: "pending" })
            : null;

          notes.push(`t1: "${t1.deadline}" | t2: "${t2.deadline}"`);
          if (conflictDoc) {
            mismatches.push(`False conflict was triggered: existing="${conflictDoc.existingDeadline}" vs new="${conflictDoc.newDeadline}"`);
          } else {
            notes.push("Correctly avoided triggering a false conflict for identical deadline");
          }
        } else {
          notes.push("Second dump did not create contradictory proposal");
        }
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 11: Casual conversation that must produce zero tasks
    // ----------------------------------------------------
    {
      const id = 11;
      const name = "Casual conversation: zero tasks produced";
      const content = `[${testRunId}] Haha that meme was hilarious! Did you see the cat jumping into the box? Yeah totally, made my day.`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "text" });
      const tasks = getTasks(res);
      if (tasks.length > 0) {
        mismatches.push(`Expected 0 tasks, but extracted: ${tasks.map((t) => t.title).join(", ")}`);
      } else {
        notes.push("Zero tasks produced as expected");
      }
      record(id, name, mismatches, notes);
    }

    // ----------------------------------------------------
    // CASE 12: Messy mixed dump containing tasks + people + irrelevant conversation
    // ----------------------------------------------------
    {
      const id = 12;
      const name = "Messy mixed dump: task + people + irrelevant banter";
      const content = `[${testRunId}]
Arjun: Guys did you see the match yesterday? Insane finish!
Kavita: Yeah Virat was amazing.
Arjun: BTW Vikram mentioned he prefers email over Slack for formal approvals.
Kavita: Good to know. Oh also, we need to send the signed NDA to legal before Wednesday at 4 PM.
Arjun: Got it, I'll ping legal if needed.`;
      const mismatches: string[] = [];
      const notes: string[] = [];

      const res = await processDump({ content, sourceType: "text" });
      if (!res.isProposal) {
        mismatches.push("Expected proposal with review required");
      } else {
        const tasks = res.proposal.tasks;
        if (tasks.length !== 1) {
          mismatches.push(`Expected exactly 1 task (NDA), found ${tasks.length}: ${tasks.map((t) => t.title).join(", ")}`);
        } else {
          const task = tasks[0];
          notes.push(`Task extracted: "${task.title}"`);
          notes.push(`Deadline: "${task.deadline}"`);
          const titleLower = task.title.toLowerCase();
          if (!titleLower.includes("nda") && !titleLower.includes("legal")) {
            mismatches.push(`Task title does not mention NDA or legal: "${task.title}"`);
          }
          if (titleLower.includes("match") || titleLower.includes("virat") || titleLower.includes("cricket")) {
            mismatches.push(`Task fabricated from casual match banter: "${task.title}"`);
          }
          if (!task.deadline) {
            mismatches.push("Expected deadline for Wednesday at 4 PM");
          }
          if (res.proposal.memories && res.proposal.memories.length > 0) {
            notes.push(`Extracted memories: ${res.proposal.memories.map((m) => m.title).join(", ")}`);
          }
        }
      }
      record(id, name, mismatches, notes);
    }

  } finally {
    // Clean up test records created during this run
    try {
      await db.collection("sources").deleteMany({ content: { $regex: testRunId } });
      await db.collection("tasks").deleteMany({ title: { $regex: testRunId } });
      await db.collection("memories").deleteMany({ title: { $regex: testRunId } });
      await db.collection("conflicts").deleteMany({ newEvidence: { $regex: testRunId } });
    } catch {}
  }

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`======================================================`);
  console.log(` Final Report: ${passedCount}/${results.length} PASSED`);
  console.log(`======================================================\n`);

  return results;
}

if (process.argv[1]?.includes("friend_test")) {
  runFriendTests()
    .then((results) => {
      const allPassed = results.every((r) => r.passed);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Test runner failed:", err);
      process.exit(1);
    });
}
