import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import type { TaskDocument } from "../db/tasks";
import type { MemoryDocument } from "../db/memories";
import type { SourceDocument } from "../db/sources";

export interface RetrievedEvidence {
  type: "task" | "memory" | "source";
  id: string;
  text: string;
}

export interface AskResponse {
  answer: string;
  evidence: RetrievedEvidence[];
}

export interface RetrievalResult {
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    deadline: string | null;
    evidence: string;
    sourceId?: string;
  }>;
  memories: Array<{
    id: string;
    type: string;
    title: string;
    content: string;
    evidence: string;
    sourceId?: string;
    taskId?: string | null;
  }>;
  sources: Array<{
    id: string;
    content: string;
  }>;
}

const COMMON_STOPWORDS = new Set([
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "did", "does", "do", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "having", "the", "a", "an", "and", "or", "but",
  "in", "on", "at", "to", "for", "with", "about", "against", "between",
  "into", "through", "during", "before", "after", "above", "below", "from",
  "up", "down", "of", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "all", "any", "both", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "can", "will", "just", "don",
  "should", "now", "tell", "please", "me", "my", "myself", "we", "our",
  "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself", "she", "her", "hers", "herself", "it",
  "its", "itself", "they", "them", "their", "theirs", "themselves",
]);

function extractKeywords(query: string): string[] {
  const cleaned = query.replace(/[^\w\s]/g, " ").toLowerCase();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const keywords = tokens.filter((t) => t.length >= 2 && !COMMON_STOPWORDS.has(t));
  return Array.from(new Set(keywords));
}

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export async function retrieveMemoryContext(question: string): Promise<RetrievalResult> {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) {
    return { tasks: [], memories: [], sources: [] };
  }

  const db = await getDb();
  const keywordRegexes = keywords.map((k) => new RegExp(escapeRegex(k), "i"));

  // Build query: match any of the keywords in relevant fields
  const taskQuery = {
    $or: keywordRegexes.flatMap((r) => [
      { title: { $regex: r } },
      { description: { $regex: r } },
      { evidence: { $regex: r } },
    ]),
  };

  const memoryQuery = {
    $or: keywordRegexes.flatMap((r) => [
      { title: { $regex: r } },
      { content: { $regex: r } },
      { evidence: { $regex: r } },
    ]),
  };

  const sourceQuery = {
    $or: keywordRegexes.map((r) => ({ content: { $regex: r } })),
  };

  const [rawTasks, rawMemories, rawSources] = await Promise.all([
    db.collection<TaskDocument>("tasks").find(taskQuery).limit(15).toArray(),
    db.collection<MemoryDocument>("memories").find(memoryQuery).limit(15).toArray(),
    db.collection<SourceDocument>("sources").find(sourceQuery).limit(15).toArray(),
  ]);

  // Scoring function: count occurrences of keywords
  function scoreText(text: string): number {
    let score = 0;
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 1;
    }
    return score;
  }

  const scoredTasks = rawTasks
    .map((t) => {
      const score =
        scoreText(t.title) * 3 +
        scoreText(t.evidence || "") * 2 +
        scoreText(t.description || "");
      return { doc: t, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ doc }) => ({
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description || "",
      deadline: doc.deadline || null,
      evidence: doc.evidence || "",
      sourceId: doc.sourceId?.toString(),
    }));

  const scoredMemories = rawMemories
    .map((m) => {
      const score =
        scoreText(m.title) * 3 +
        scoreText(m.content) * 2 +
        scoreText(m.evidence || "") * 2;
      return { doc: m, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ doc }) => ({
      id: doc._id.toString(),
      type: doc.type,
      title: doc.title,
      content: doc.content,
      evidence: doc.evidence || "",
      sourceId: doc.sourceId?.toString(),
      taskId: doc.taskId ? doc.taskId.toString() : null,
    }));

  const scoredSources = rawSources
    .map((s) => {
      const score = scoreText(s.content || "");
      return { doc: s, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ doc }) => ({
      id: doc._id.toString(),
      content: doc.content || "",
    }));

  return {
    tasks: scoredTasks,
    memories: scoredMemories,
    sources: scoredSources,
  };
}

const askOutputSchema = z.object({
  answer: z.string(),
  evidence: z.array(
    z.object({
      type: z.enum(["task", "memory", "source"]),
      id: z.string(),
      text: z.string(),
    })
  ),
});

const askJsonFormat = {
  type: "object",
  properties: {
    answer: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["task", "memory", "source"] },
          id: { type: "string" },
          text: { type: "string" },
        },
        required: ["type", "id", "text"],
      },
    },
  },
  required: ["answer", "evidence"],
};

export async function askUnbury(question: string): Promise<AskResponse> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      answer: "Please provide a question.",
      evidence: [],
    };
  }

  // 1. Deterministic retrieval
  const context = await retrieveMemoryContext(trimmed);

  const totalRetrieved =
    context.tasks.length + context.memories.length + context.sources.length;

  // Rule 5: Important hallucination protection
  // If retrieval returns zero useful records, do NOT call Gemma with an empty context.
  if (totalRetrieved === 0) {
    return {
      answer: "I don't have enough stored information to answer that yet.",
      evidence: [],
    };
  }

  // 2. Format retrieved context into bounded prompt
  let contextBlock = "Retrieved records from Unbury memory:\n\n";

  if (context.tasks.length > 0) {
    contextBlock += "TASKS:\n";
    for (const t of context.tasks) {
      contextBlock += `- Task ID: ${t.id}\n  Title: "${t.title}"\n  Deadline: ${t.deadline || "None"}\n  Evidence quote: "${t.evidence}"\n`;
    }
    contextBlock += "\n";
  }

  if (context.memories.length > 0) {
    contextBlock += "MEMORIES:\n";
    for (const m of context.memories) {
      contextBlock += `- Memory ID: ${m.id} (${m.type})\n  Title: "${m.title}"\n  Content: "${m.content}"\n  Evidence quote: "${m.evidence}"\n`;
    }
    contextBlock += "\n";
  }

  if (context.sources.length > 0) {
    contextBlock += "SOURCES:\n";
    for (const s of context.sources) {
      const snippet = s.content.length > 300 ? s.content.slice(0, 297) + "…" : s.content;
      contextBlock += `- Source ID: ${s.id}\n  Content snippet: "${snippet}"\n`;
    }
    contextBlock += "\n";
  }

  const systemPrompt = `You are Ask Unbury, an external memory assistant.
Answer the user's question ONLY using the retrieved records provided above.
Rules:
1. Answer ONLY from facts explicitly stated in the retrieved records.
2. Never invent or hallucinate missing facts, deadlines, names, email addresses, phone numbers, or dates.
3. If the records do not contain the specific answer to the question (e.g. if asked for a phone number or detail that is not in the text), you MUST answer: "I don't have enough stored information to answer that yet." and return an empty evidence array [].
4. Do not infer or invent deadlines.
5. In the "evidence" array, include each specific record (task, memory, or source) with its exact "id", "type", and the supporting "text" quote from the record.
6. Keep the answer concise, direct, and factual (1-2 sentences).`;

  const userPrompt = `Question: "${trimmed}"\n\n${contextBlock}`;

  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "gemma3";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let rawContent = "";
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        format: askJsonFormat,
        options: {
          temperature: 0.1,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }

    const data = await response.json();
    rawContent = data?.message?.content || "";
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    console.error("Ask Ollama fetch error:", err);
    // If Ollama is unreachable, return grounded fallback
    return {
      answer: "I couldn't query memory right now. Please ensure Ollama is running.",
      evidence: [],
    };
  } finally {
    clearTimeout(timeoutId);
  }

  try {
    let cleaned = rawContent.trim();
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleaned);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    const parsed = JSON.parse(cleaned);
    const validated = askOutputSchema.safeParse(parsed);

    if (validated.success) {
      return validated.data;
    }
  } catch {}

  // Safe fallback if parsing or validation failed
  return {
    answer: "I don't have enough stored information to answer that yet.",
    evidence: [],
  };
}
