import { extractionSchema, type ExtractionResult, type ExtractedTask, type ExtractedMemory } from "./extraction-schema";
import { getCurrentDateContext, getCalendarReference } from "../date";

export class ExtractionError extends Error {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = "ExtractionError";
    this.originalError = originalError;
  }
}

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = fenceRegex.exec(cleaned);
  if (match) {
    cleaned = match[1].trim();
  }

  // Escape unescaped control characters and literal newlines inside JSON strings
  let inString = false;
  let escaped = false;
  let sanitized = "";

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) {
        sanitized += char;
        escaped = false;
      } else if (char === "\\") {
        sanitized += char;
        escaped = true;
      } else if (char === '"') {
        sanitized += char;
        inString = false;
      } else if (char === "\n") {
        sanitized += "\\n";
      } else if (char === "\r") {
        sanitized += "\\r";
      } else if (char === "\t") {
        sanitized += "\\t";
      } else {
        sanitized += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      sanitized += char;
    }
  }

  // If JSON output was cut off mid-string at token boundary, close quotes and brackets gracefully
  if (inString) {
    sanitized += '"';
  }

  // Maintain a stack of opening brackets to close in exact reverse (LIFO) order if truncated
  const stack: string[] = [];
  let s2 = false;
  let esc2 = false;
  for (let i = 0; i < sanitized.length; i++) {
    const c = sanitized[i];
    if (s2) {
      if (esc2) esc2 = false;
      else if (c === "\\") esc2 = true;
      else if (c === '"') s2 = false;
    } else {
      if (c === '"') s2 = true;
      else if (c === "{" || c === "[") stack.push(c);
      else if (c === "}" && stack.length > 0 && stack[stack.length - 1] === "{") stack.pop();
      else if (c === "]" && stack.length > 0 && stack[stack.length - 1] === "[") stack.pop();
    }
  }

  if (stack.length > 0) {
    sanitized = sanitized.replace(/,\s*$/, "");
    while (stack.length > 0) {
      const open = stack.pop();
      if (open === "{") sanitized += "}";
      else if (open === "[") sanitized += "]";
    }
  }

  return sanitized;
}

function hasClockTime(text: string): boolean {
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i.test(text)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(text)) return true;
  if (/\b(at|by)\s+\d{1,2}\s*(o'?clock)?\b/i.test(text)) return true;
  if (/\b(noon|midnight)\b/i.test(text)) return true;
  return false;
}

function hasDateReference(text: string): boolean {
  if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(text)) return true;
  if (/\b(today|tomorrow|tmrw|tonight|yesterday|this week|next week|weekend)\b/i.test(text)) return true;
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) return true;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(text)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/.test(text)) return true;
  return false;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeCoordinatedTasks(tasks: ExtractedTask[], originalContent: string): ExtractedTask[] {
  if (tasks.length <= 1) return tasks;

  const result: ExtractedTask[] = [];
  const normalized = originalContent.toLowerCase();

  let i = 0;
  while (i < tasks.length) {
    let current = tasks[i];

    if (i + 1 < tasks.length) {
      const next = tasks[i + 1];
      const sameDeadline = current.deadline === next.deadline;

      const matchA = /^([A-Za-z]+)\s+(.+)$/.exec(current.title.trim());
      const matchB = /^([A-Za-z]+)\s+(.+)$/.exec(next.title.trim());

      if (sameDeadline && matchA && matchB) {
        const verbA = matchA[1].toLowerCase();
        const verbB = matchB[1].toLowerCase();
        const objA = matchA[2].toLowerCase();
        const objB = matchB[2].toLowerCase();

        if (verbA === verbB) {
          const pattern1 = `${verbA} ${objA} and ${objB}`;
          const pattern2 = `${objA} and ${objB}`;
          const pattern3 = `${verbA} ${objA}, ${objB}`;

          if (normalized.includes(pattern1) || normalized.includes(pattern2) || normalized.includes(pattern3)) {
            current = {
              title: `${current.title} and ${matchB[2]}`,
              description: current.description || next.description,
              deadline: current.deadline,
              priority: current.priority === "high" || next.priority === "high" ? "high" : current.priority,
              evidence: current.evidence.toLowerCase().includes(objB)
                ? current.evidence
                : `${current.evidence} ${next.evidence}`.trim(),
            };
            i++;
          }
        }
      }
    }

    result.push(current);
    i++;
  }

  return result;
}

export function cleanTaskTitle(rawTitle: string, deadline: string | null): string {
  let cleaned = rawTitle.trim();
  cleaned = cleaned.replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|remind\s+me\s+to\s+|i\s+need\s+to\s+|make\s+sure\s+to\s+|kindly\s+)/i, "");
  cleaned = cleaned.replace(/^share\s+me\s+the\s+/i, "Share the ");

  if (deadline) {
    // 1. Strip inline deadline phrases (e.g. 'call Rahul tomorrow at 5 PM about Basera' -> 'call Rahul about Basera')
    cleaned = cleaned.replace(/\s+(?:tomorrow|today|tonight|on\s+monday|by\s+monday|on\s+sunday|by\s+sunday|on\s+friday|by\s+friday)(?:\s+(?:at|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|p\.m\.|a\.m\.|five\s+pm|5\s+pm)?)?\s+(?=(?:about|regarding|for|with|to)\b)/i, " ");

    // 2. Strip trailing deadline phrases (e.g. 'by Monday at 6 PM.', 'tomorrow at 5 PM', 'due Sunday at 11:59 PM')
    const prep = "(?:by|before|at|on|due\\s+on|due\\s+by|due|until|till|for)";
    const day = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)";
    const rel = "(?:today|tomorrow|tmrw|tonight|this\\s+week|next\\s+week|weekend)";
    const time = "(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)|\\d{1,2}:\\d{2}|noon|midnight)";
    const date = "(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)";

    const trailingPattern = new RegExp(
      "\\s+(?:" + prep + "\\s+)?(?:" + day + "|" + rel + "|" + date + "|" + time + ")(?:\\s+(?:" + prep + "|at|by|on|around)?\\s*(?:" + time + "|" + day + "|" + rel + "|" + date + "|sharp|morning|afternoon|evening|night|eod))*[^a-zA-Z0-9]*$",
      "i"
    );
    cleaned = cleaned.replace(trailingPattern, "");
  }

  cleaned = cleaned.replace(/[.,:;!]+$/, "").trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned || rawTitle;
}


function sanitizeAndValidateResult(
  data: ExtractionResult,
  originalContent: string
): ExtractionResult {
  const normalizedContent = originalContent.toLowerCase();
  const tasks: ExtractedTask[] = [];

  const NON_TASK_STARTERS = /^(breaking down|waiting for|working on|discussed|talking about|chatting with|looking at|thinking about|had a (great|good) discussion)\b/i;

  for (const task of data.tasks) {
    const rawTitle = task.title.trim();
    if (!rawTitle) continue;

    let evidence = task.evidence.trim();
    if (!evidence || !normalizedContent.includes(evidence.toLowerCase())) {
      const sentences = originalContent.split(/[.?!;\n]+/).map((s) => s.trim()).filter(Boolean);
      const matchingSentence = sentences.find((s) => {
        const sLower = s.toLowerCase();
        const words = rawTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        return words.some((w) => sLower.includes(w));
      });
      evidence = matchingSentence || originalContent.slice(0, 120);
    }

    let deadline: string | null = task.deadline ? task.deadline.trim() : null;

    if (!deadline && data.memories) {
      const deadlineMem = data.memories.find(
        (m) => m.type === "deadline" && m.content && (
          !m.evidence ||
          evidence.toLowerCase().includes(m.evidence.toLowerCase()) ||
          m.evidence.toLowerCase().includes(evidence.toLowerCase()) ||
          normalizedContent.includes(m.evidence.toLowerCase())
        )
      );
      if (deadlineMem && deadlineMem.content) {
        deadline = deadlineMem.content.trim();
      }
    }

    if (!deadline) {
      const isTonight = /\btonight\b/i.test(evidence) || (/\btonight\b/i.test(normalizedContent) && evidence.length > 0);
      const isToday = /\btoday\b/i.test(evidence) || (/\btoday\b/i.test(normalizedContent) && evidence.length > 0);
      const isTomorrow = /\b(tomorrow|tmrw)\b/i.test(evidence) || /\b(tomorrow|tmrw)\b/i.test(normalizedContent);
      if ((isTonight || isToday) && !isTomorrow) {
        deadline = getCurrentDateContext().currentDate;
      }
    }

    if (deadline) {
      const textHasDate = hasDateReference(evidence) || hasDateReference(originalContent);
      if (!textHasDate) {
        deadline = null;
      } else {
        const textHasTime = hasClockTime(evidence) || hasClockTime(originalContent);
        const deadlineHasTime =
          (deadline.includes("T") || deadline.includes(":")) &&
          !/^\d{4}-\d{2}-\d{2}$/.test(deadline);

        if (deadlineHasTime && !textHasTime) {
          const match = /^(\d{4}-\d{2}-\d{2})/.exec(deadline);
          deadline = match ? match[1] : null;
        }

        // Relative phrase normalization: "tonight" is today's date, NOT tomorrow, and has no clock time unless explicitly given
        const isTonight = /\btonight\b/i.test(evidence) || /\btonight\b/i.test(normalizedContent);
        const mentionsTomorrow = /\b(tomorrow|tmrw)\b/i.test(evidence) || /\b(tomorrow|tmrw)\b/i.test(normalizedContent);
        if (isTonight && !mentionsTomorrow && !textHasTime) {
          deadline = getCurrentDateContext().currentDate;
        }
      }
    }

    // Reject non-date deadline strings like "Ongoing", "Flexible", "ASAP", "N/A"
    if (deadline && !hasDateReference(deadline) && !/^\d{4}-\d{2}-\d{2}/.test(deadline)) {
      deadline = null;
    }

    // Reject schema artifact names and type labels erroneously generated as task titles
    if (/^(person|context|deadline|memory|task|reminder|event|document|metadata|note|status)$/i.test(rawTitle)) {
      continue;
    }

    // Reject truncated or fragmented titles ending in prepositions/conjunctions
    if (/\b(or|and|to|of|with|in|for|from|by|at)$/i.test(rawTitle)) {
      continue;
    }

    // Reject conversational fragments and non-actionable notes without a deadline
    if (NON_TASK_STARTERS.test(rawTitle) && !deadline) {
      continue;
    }

    // Reject synthetic reply/confirmation tasks where action was not explicitly requested in text
    const isSyntheticReply = /^(send\s+.*confirmation|confirm\s+|reply(\s+to)?\s+|acknowledge\s+|respond(\s+to)?\s+)/i.test(rawTitle);
    if (isSyntheticReply) {
      const explicitActionInText = /\b(confirm|confirmation|reply|respond|response|acknowledg(e|ment))\b/i.test(evidence) || /\b(confirm|confirmation|reply|respond|response|acknowledg(e|ment))\b/i.test(normalizedContent);
      if (!explicitActionInText) {
        continue;
      }
    }

    // Reject program/internship duration statements (e.g. "Your internship runs from Oct 1 to Nov 30", "Start/Complete internship...")
    const isDurationStatement =
      /^(start|begin|commence|complete|finish|end)\s+(the\s+)?(internship|program|tenure|contract|fellowship|course|probation)\b/i.test(rawTitle) ||
      /^(internship|contract|program|tenure)\s+(runs|lasts|spans|is)\s+from\b/i.test(rawTitle);
    if (isDurationStatement) {
      continue;
    }

    // Reject generic document expectations, conduct guidelines, and ongoing duties
    const isGenericResponsibility =
      /^(maintain|ensure)\s+(professionalism|reasonable\s+consistency|consistency|availability|decorum|standards|compliance|confidentiality)\b/i.test(rawTitle) ||
      /^(actively\s+)?participate\s+in\s+(assigned\s+tasks|team\s+activities|discussions|meetings)\b/i.test(rawTitle) ||
      /^complete\s+(assigned\s+)?(work|tasks?|activities)\s+within\s+(mutually\s+agreed\s+)?timelines\b/i.test(rawTitle) ||
      /^(follow|adhere\s+to|comply\s+with)\s+([a-z0-9'\s]+)?(guidelines|instructions|policies|code\s+of\s+conduct|terms)\b/i.test(rawTitle) ||
      /^inform\s+(the\s+)?team\s+in\s+advance\b/i.test(rawTitle);
    if (isGenericResponsibility) {
      continue;
    }

    // Reject confidentiality, NDA, IP, and boilerplate legal policy clauses
    const isPolicyOrLegalClause =
      /^(do\s+not|not|never)\s+(retain|misuse|share|disclose|distribute|publish|copy)\s+([a-z0-9'\s]+)?(confidential|proprietary|internal|non-public)\b/i.test(rawTitle) ||
      /^(keep|hold|maintain)\s+([a-z0-9'\s]+)?(information\s+)?confidential\b/i.test(rawTitle) ||
      /^(immediately\s+)?report\s+(any\s+)?(suspected\s+)?(unauthorized\s+access|disclosure|loss|breach)\b/i.test(rawTitle) ||
      /^(by\s+accepting|accept\s+the\s+internship\s+offer|agree\s+to\s+(the\s+)?terms|acknowledge\s+that\s+you\s+have\s+read)\b/i.test(rawTitle);
    if (isPolicyOrLegalClause) {
      continue;
    }

    // Reject issuer/metadata hallucinations (e.g. "Send offer letter to X" when the document itself is that offer letter)
    const isIssuerOrMetadataTask = /^(send|issue|provide)\s+(an?\s+)?(offer\s+letter|appointment\s+letter|contract|agreement)\s+to\b/i.test(rawTitle);
    if (isIssuerOrMetadataTask) {
      const isDocumentItself = /\b(we\s+are\s+pleased\s+to\s+offer|offer\s+letter\s+id|date\s+of\s+issue)\b/i.test(normalizedContent);
      if (isDocumentItself && !/\bsigned\b/i.test(rawTitle)) {
        continue;
      }
    }

    // Reject casual social pleasantries, greetings, and sign-offs
    const isCasualSocial = /^(let'?s\s+)?(catch\s+up|meet\s+up|hang\s+out|talk\s+soon|see\s+you|have\s+fun|take\s+care)(\s+(?:tomorrow|later|soon|then|sometime|again))?$/i.test(rawTitle) ||
      /\b(let'?s\s+catch\s+up|talk\s+soon|see\s+you\s+(later|tomorrow|soon)|have\s+fun|take\s+care)\b/i.test(rawTitle);
    if (isCasualSocial) {
      continue;
    }

    // Reject informational status statements (flight, travel, weather, past facts)
    if (/^(flight\s+landed|landed\s+in|weather\s+is|reached\s+safely|arrived\s+in)\b/i.test(rawTitle)) {
      continue;
    }

    const title = cleanTaskTitle(rawTitle, deadline);

    let priority: "low" | "medium" | "high" = "medium";
    const evLower = evidence.toLowerCase();
    const isExplicitHigh = /\b(urgent|urgently|critical|asap|emergency|crucial|exam|highest priority)\b/i.test(evLower);
    const isExplicitLow = /\b(low priority|optional|whenever|someday|if time permits|no rush)\b/i.test(evLower);

    if (isExplicitHigh) {
      priority = "high";
    } else if (isExplicitLow) {
      priority = "low";
    } else {
      priority = "medium";
    }

    tasks.push({
      title,
      description: task.description ? task.description.trim() : "",
      deadline,
      priority,
      evidence,
    });
  }


  const memories: ExtractedMemory[] = [];
  for (const mem of data.memories) {
    let title = mem.title
      .replace(/@/g, "")
      .replace(/(?<!\b(?:at|by|before|until|till|due)\s+)(?:\b([01]?\d|2[0-3])[:.][0-5]\d\b|\b2[0-3][0-5]\d\b)/gi, "")
      .trim();

    let content = mem.content
      .replace(/(?<!\b(?:at|by|before|until|till|due)\s+)(?:\b([01]?\d|2[0-3])[:.][0-5]\d\b|\b2[0-3][0-5]\d\b)/gi, "")
      .trim();

    if (!title || !content) continue;
    if (title.toLowerCase() === "unbury" || content.toLowerCase().includes("memory assistant")) continue;

    let evidence = mem.evidence.trim();
    if (!evidence || !normalizedContent.includes(evidence.toLowerCase())) {
      evidence = originalContent.slice(0, 120);
    }

    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();

    // 1. Filter out obvious malformed, low-information, or transient adjectives/words
    const LOW_INFO_WORDS = /^(messy|busy|fine|great|okay|nice|tired|good|bad|cool|happy|sad|ready|quick|things|weather)$/i;
    if (LOW_INFO_WORDS.test(titleLower) || LOW_INFO_WORDS.test(contentLower)) {
      continue;
    }

    // 2. Filter out generic transient phrases or filler
    const TRANSIENT_PHRASES = /^(things are (a bit )?messy(\s+right\s+now)?|weather is nice|you don'?t want to forget|have fun( guys)?|okay cool|i'?m busy(\s+today)?|that meeting was great)$/i;
    if (TRANSIENT_PHRASES.test(titleLower) || TRANSIENT_PHRASES.test(contentLower)) {
      continue;
    }
    if (contentLower.includes("you don't want to forget") || contentLower.includes("you dont want to forget")) {
      continue;
    }
    if (titleLower.includes("things are messy") || contentLower.includes("things are messy")) {
      continue;
    }

    // 3. For context memories, ensure title/content provide meaningful context rather than trivial fragments or hallucinations
    if (mem.type === "context") {
      if (title.length < 3 || content.length < 3) continue;
      if (/^(screenshot|note|message|things|weather|chat|text)$/i.test(titleLower)) {
        continue;
      }
      // Ensure key words of content actually appear in original text (prevents prompt hallucination leakage)
      const contentWords = content.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      const someWordsInText = contentWords.length === 0 || contentWords.some((w) => normalizedContent.includes(w));
      if (!someWordsInText) {
        continue;
      }
    }

    // 4. For deadline memories, ensure there is an actual date reference
    if (mem.type === "deadline") {
      if (!hasDateReference(content) && !hasDateReference(evidence) && !hasClockTime(content)) {
        continue;
      }
    }

    if (mem.type === "person") {
      // If person title contains role like "Akshay DU operations", separate name
      const parts = title.split(/\s+/);
      if (parts.length >= 2 && /DU|operations|tech|social|lead|manager|head|engineer|marketing/i.test(title)) {
        title = parts[0];
      }
      const nameParts = title.split(/\s+/).filter((p) => p.length >= 2);
      const isNameInContent = nameParts.some((p) => normalizedContent.includes(p.toLowerCase()));
      if (!isNameInContent) {
        continue;
      }

      // Filter out conversational greetings, slang, and non-durable filler content
      const CASUAL_PERSON_CONTENT = /^(bro|dude|man|hey|hello|hi|bye|chilling|just chilling|nothing much|okay cool|cool|see you( tomorrow)?|have fun( guys)?|talking|chatting|friend|participant|speaker|sender|mentioned|said)$/i;
      if (CASUAL_PERSON_CONTENT.test(contentLower) || CASUAL_PERSON_CONTENT.test(titleLower)) {
        continue;
      }

      const CASUAL_PHRASES = /^(what are you doing|doing nothing|nothing much|just chilling|see you( tomorrow| later| soon)?|okay cool|have fun( guys)?|are we meeting|how are you|talk soon)$/i;
      if (CASUAL_PHRASES.test(contentLower) || contentLower.startsWith("bro ") || contentLower === "bro") {
        continue;
      }

      // If the candidate person is just a chat participant handle ("Name:") in the source text:
      // A person memory requires meaningful relationship/role/context explicitly grounded in the source.
      const nameRegex = new RegExp(`\\b${escapeRegExp(title)}\\s*:`, "i");
      const isChatHandle = nameRegex.test(originalContent);
      if (isChatHandle) {
        const SUBSTANTIVE_ROLE_OR_TASK = /\b(lead|manager|head|engineer|developer|designer|professor|prof|teacher|team|legal|backend|frontend|design|marketing|operations|ops|handling|responsible|handles|prefers|preference|owner|assignee|submitted|assigned|asked|contact|flatmate|client|doctor|student|report|assignment|exam|project|landing page|budget|nda|approval|spreadsheet|code|deploy|submit|send|review|document|form|contract|proposal)\b/i;
        const hasSubstantiveContext = SUBSTANTIVE_ROLE_OR_TASK.test(contentLower) || SUBSTANTIVE_ROLE_OR_TASK.test(evidence.toLowerCase());
        if (!hasSubstantiveContext) {
          continue;
        }
      }
    }

    memories.push({
      type: mem.type,
      title,
      content,
      evidence,
    });
  }

  const mergedTasks = mergeCoordinatedTasks(tasks, originalContent);
  return { tasks: mergedTasks, memories };
}


function normalizeResult(parsed: unknown, originalContent: string): unknown {
  if (typeof parsed !== "object" || parsed === null) {
    return parsed;
  }

  const obj = parsed as Record<string, unknown>;

  const tasks = Array.isArray(obj.tasks)
    ? obj.tasks
    : Array.isArray(obj.task)
      ? obj.task
      : [];

  const memories = Array.isArray(obj.memories)
    ? obj.memories
    : Array.isArray(obj.memory)
      ? obj.memory
      : [];

  const seenTitles = new Set<string>();
  const normalizedTasks: Array<{
    title: string;
    description: string;
    deadline: string | null;
    priority: "low" | "medium" | "high";
    evidence: string;
  }> = [];

  for (const t of tasks) {
    if (typeof t !== "object" || t === null) continue;
    const taskObj = t as Record<string, unknown>;
    const rawTitle = typeof taskObj.title === "string"
      ? taskObj.title
      : typeof taskObj.task === "string"
        ? taskObj.task
        : typeof taskObj.name === "string"
          ? taskObj.name
          : "";
    const title = rawTitle.trim();
    if (!title) continue;

    const lowerKey = title.toLowerCase();
    if (seenTitles.has(lowerKey)) continue;
    seenTitles.add(lowerKey);

    const rawPriority = typeof taskObj.priority === "string" ? taskObj.priority.toLowerCase() : "medium";
    const priority = ["low", "medium", "high"].includes(rawPriority)
      ? (rawPriority as "low" | "medium" | "high")
      : "medium";

    const deadline = typeof taskObj.deadline === "string" && taskObj.deadline.trim()
      ? taskObj.deadline.trim()
      : null;

    const rawEvidence = typeof taskObj.evidence === "string" ? taskObj.evidence.trim() : "";
    const evidence = rawEvidence || originalContent.slice(0, 120);

    normalizedTasks.push({
      title,
      description: typeof taskObj.description === "string" ? taskObj.description.trim() : "",
      deadline,
      priority,
      evidence,
    });
  }

  const normalizedMemories: Array<{
    type: "person" | "deadline" | "context";
    title: string;
    content: string;
    evidence: string;
  }> = [];

  for (const m of memories) {
    if (typeof m !== "object" || m === null) continue;
    const memObj = m as Record<string, unknown>;
    const type =
      typeof memObj.type === "string"
        ? memObj.type.toLowerCase()
        : "context";

    const title = typeof memObj.title === "string" ? memObj.title.trim() : "";
    const content = typeof memObj.content === "string" ? memObj.content.trim() : "";
    if (!title || !content) continue;

    const rawEvidence = typeof memObj.evidence === "string" ? memObj.evidence.trim() : "";
    const evidence = rawEvidence || originalContent.slice(0, 120);

    normalizedMemories.push({
      type: ["person", "deadline", "context"].includes(type) ? (type as "person" | "deadline" | "context") : "context",
      title,
      content,
      evidence,
    });
  }

  return {
    tasks: normalizedTasks,
    memories: normalizedMemories,
  };
}

const extractionJsonSchema = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          deadline: { type: ["string", "null"] },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          evidence: { type: "string" },
        },
        required: ["title", "deadline", "priority", "evidence"],
      },
    },
    memories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["person", "deadline", "context"] },
          title: { type: "string" },
          content: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["type", "title", "content", "evidence"],
      },
    },
  },
  required: ["tasks", "memories"],
};

export async function extractFromText(content: string): Promise<ExtractionResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "gemma3";
  const dateCtx = getCurrentDateContext();
  const calendarRef = getCalendarReference();

  const systemPrompt = `You are a strict, factual information extraction engine for Unbury, an AI external memory assistant.
Your job is structured data extraction from user text dumps.
Never invent, fabricate, or assume any information that is not explicitly present in the source text.

Reference calendar (${dateCtx.timezone}):
${calendarRef}

Strict Rules:
1. Evidence:
   - "evidence" MUST be an exact verbatim substring quoted directly from the input text.
   - Do NOT paraphrase or explain in "evidence".

2. Actionable Tasks:
   - A task MUST be explicitly requested, assigned, promised, or committed to in the source text (e.g., "Send me the report", "Call Rahul", "Share the one month strategy", "Submit Assignment 3", "Email the professor").
   - Task "title" MUST contain only the action and deliverable/object. DO NOT include the deadline or deadline phrase (such as "by Monday at 6 PM", "tomorrow at 5 PM", "by Sunday") inside "title" when a deadline is present.
   - Coordinated objects in a single action vs separate tasks:
     * When a single action or verb applies to multiple coordinated objects/items in one request or sentence (e.g. "Buy oat milk and bananas", "Pick up groceries and dry cleaning", "Bring notebook and pens"), keep them together as ONE task: "Buy oat milk and bananas". Do NOT split coordinated items of a single action into multiple separate tasks.
     * Only create separate tasks when there are distinct, independent actions or deliverables (e.g., "Tomorrow submit the report and bring the signed form" -> 2 tasks; "Send the report and email Rahul" -> 2 tasks).
   - DO NOT infer an obligation from:
     * Casual or social phrases, greetings, or sign-offs (e.g. "let's catch up", "see you", "talk soon", "have fun", "take care", "catch up tomorrow", "let's grab lunch sometime"). Return "tasks": [].
     * Informational or status updates, travel updates, facts about something that already happened (e.g., "flight landed in Delhi on October 2nd", "weather is nice", "I reached safely"). Return "tasks": [].
     * Announcements or past events.
     * An implied need to reply, confirm, acknowledge, or respond.
   - CRITICAL RESTRICTIONS:
     * NEVER turn an informational statement into "reply", "confirm", "send confirmation", "acknowledge", etc. unless the source text explicitly asks to confirm or reply.
     * NEVER turn casual future social language into a task unless there is a concrete actionable plan/request.
     * A date or time alone does NOT make something a task. Past dates or informative dates are NOT tasks.
   - Positive examples that MUST be tasks:
     * "Tomorrow I need to buy oat milk and bananas." -> Task: "Buy oat milk and bananas", Deadline: tomorrow (ONE task; do not split coordinated items)
     * "Please send the report tomorrow." -> Task: "Send the report", Deadline: tomorrow
     * "Can you call Rahul at 5 PM?" -> Task: "Call Rahul", Deadline: 5 PM
     * "I need to submit the assignment by Sunday." -> Task: "Submit the assignment", Deadline: Sunday
     * "Don't forget to bring the documents Monday." -> Task: "Bring the documents", Deadline: Monday
     * "Professor asked us to submit Assignment 3 by Sunday." -> Task: "Submit Assignment 3", Deadline: Sunday
   - Non-task examples (MUST return "tasks": []):
     * "Rohan: Okay cool, let's catch up tomorrow then! Sneha: Have fun guys!" -> NOT a task (casual social sign-off).
     * "Just letting you know our flight landed in Delhi on October 2nd. The weather here is nice and sunny." -> NOT a task (informational status update).
     * "Breaking down with the weekly target" -> NOT a task (elaboration fragment).
     * "Waiting for you all" -> NOT a task (status update).
     * "Working on the project" -> NOT a task (status update).
     * "We discussed the strategy" -> NOT a task (past discussion).
     * "The project is almost complete" -> NOT a task (statement of fact).
     * "Had a great discussion with the team today" -> NOT a task (conversational note).
   - Documents, Contracts, Offer Letters, Policies & Informational Text:
     * A document statement becomes a task ONLY when it represents a concrete actionable item that the user is explicitly expected/requested to perform or deliver (e.g., "Please send the signed offer letter by Friday" -> 1 task; "Submit your signed acceptance form by Friday" -> 1 task; "Complete the onboarding form by Monday" -> 1 task).
     * NEVER create tasks from generic document responsibilities or ongoing expectations (e.g. "Complete assigned work within mutually agreed timelines", "Actively participate in assigned tasks", "Maintain professionalism", "Maintain reasonable consistency and availability", "Inform the team in advance"). Return "tasks": [].
     * NEVER create tasks from company policies, codes of conduct, or compliance rules (e.g. "Follow Basera's internal guidelines and instructions"). Return "tasks": [].
     * NEVER create tasks from confidentiality clauses, NDA terms, IP rules, or data protection terms (e.g. "Keep such information confidential", "Do not share confidential information", "Not retain or misuse confidential information"). Return "tasks": [].
     * NEVER create tasks from document metadata, issue dates, or headers (e.g. "Date of Issue: 30 September 2026", "Offer Letter ID: BSR/INT/2026/003"). Do NOT invent tasks like "Send offer letter to X". Return "tasks": [].
     * NEVER turn contract, internship, or program duration dates into tasks (e.g. "Duration 1 October 2026 - 30 November 2026", "Your internship runs from Oct 1 to Nov 30"). Duration dates are descriptive information, NOT tasks or task deadlines. Do NOT create tasks like "Start internship" or "Complete internship". Return "tasks": [].
     * NEVER turn boilerplate acceptance statements or signature blocks into tasks (e.g. "By accepting this offer, you acknowledge..."). Return "tasks": [].
   - If uncertain whether something is an actionable task, DO NOT create a task. Return "tasks": [].

3. Deadlines (NEVER FABRICATE TIME):
   - Use the Reference calendar above to resolve relative days (e.g. Sunday -> 2026-10-04, Monday -> 2026-10-05, tomorrow -> 2026-10-03).
   - "tonight" or "today" refers to TODAY's date (NOT tomorrow). Format as date-only "YYYY-MM-DD" (${dateCtx.currentDate}).
   - If BOTH a date and a specific clock time are explicitly mentioned in the text (e.g., "Sunday at 11:59 PM", "tomorrow at 5 PM"): format deadline as ISO-8601 string with time and timezone offset (e.g., "2026-10-04T23:59:00+05:30" or "2026-10-03T17:00:00+05:30").
   - If ONLY a date or relative day is mentioned WITHOUT a specific clock time (e.g., "Monday's lab", "due tomorrow", "due Friday", "tonight", "today"): format as date ONLY "YYYY-MM-DD" (e.g., "2026-10-05", "${dateCtx.currentDate}").
   - NEVER INVENT A CLOCK TIME. Do NOT invent a clock time for: "tomorrow", "today", "tonight", "Monday", "Sunday", "next week", etc. If no clock time is stated in the text, deadline MUST be strictly "YYYY-MM-DD" or null. Never guess times like 09:00, 10:00, 12:00, 18:00, 21:00.
   - If NO date or deadline is stated in the text: deadline MUST be null.

4. Priority:
   - Default is "medium".
   - Only use "high" if urgent words ("urgent", "asap", "critical", "exam") appear in the text.
   - Only use "low" if explicitly optional ("optional", "whenever", "no rush").

5. Memories (Core Rule: MUST be durable, useful facts, NOT transient chat or adjectives):
   - A memory MUST represent a durable, useful detail that is explicitly stated or strongly grounded in the source text.
   - PREFER ZERO MEMORIES over speculative, trivial, or low-information memories. If there is no meaningful durable fact, return "memories": [].

   - Person Memories (Core Rule: A person's name alone is NOT a memory):
     * A person memory REQUIRES a meaningful, durable relationship, role, or task responsibility explicitly stated in the source text.
     * Chat speakers, participants, or greetings (e.g., "Rohan: Bro what are you doing?", "Priya: Okay cool", "Ankit: Nothing much", "Rahul: Hey bro", "Rohan: See you tomorrow") must NEVER become memories. Return 0 memories.
     * Valid person memories:
       - "Rahul handles the backend for Basera." -> Person: "Rahul", Content: "Handles backend for Basera" (clear role/responsibility)
       - "Anshika is handling the design." -> Person: "Anshika", Content: "Handling the design"
       - "Professor asked Rahul to submit the report." -> Person: "Rahul", Content: "Asked to submit the report" (task relationship)
       - "Vikram mentioned he prefers email over Slack for formal approvals." -> Person: "Vikram", Content: "Prefers email over Slack for formal approvals" (durable preference)
     * Invalid person memories (MUST return 0 memories):
       - "Rohan: Bro what are you doing? Ankit: Nothing much, just chilling. Priya: Okay cool, see you tomorrow." -> 0 memories.
       - "Rahul: Hey bro" -> 0 memories.
       - "Priya: Okay cool" -> 0 memories.
       - "Ankit: Nothing much" -> 0 memories.
       - "Rohan: See you tomorrow" -> 0 memories.

   - DO NOT create memories from:
     * Casual chat speakers, informal conversation, or greetings without explicit roles or task relationships.
     * Adjectives, descriptive words, or quality assessments (e.g., "messy", "busy", "fine", "great", "okay", "nice", "tired", "good", "bad", "cool").
     * Temporary states or emotional wording (e.g., "Things are messy right now", "I'm busy today", "Things are a bit messy here", "That meeting was great").
     * Generic weather or small talk (e.g., "The weather is nice", "Having fun", "Sunny day").
     * Generic conversational phrases or filler (e.g., "Okay cool", "Have fun guys", "You don't want to forget", "Bro what are you doing", "Chilling").
     * UI/OCR artifacts, battery/signal levels, or chat timestamps.
     * Isolated words or single nouns without a durable entity relationship.

   - Memory Types:
     * "person": Must have an actual person/entity relationship, role, or stated responsibility (e.g., Title: "Anshika", Content: "Handling the design"; Title: "Akshay", Content: "Responsible for DU operations"). Do NOT extract a person if there is no stated role/context beyond a bare name, greeting, or casual chat.
     * "context": Must contain meaningful, durable context or project requirement (e.g., Title: "Mobile app checkout", Content: "Needs address validation step"; Title: "Lab sessions", Content: "Block C, room 204"). Never make a single adjective, transient phrase, or casual sentence a context memory.
     * "deadline": Must correspond to an actual explicit deadline or key event date.

   - Examples that MUST NOT become memories (return "memories": []):
     * "Rohan: Bro what are you doing? Ankit: Nothing much, just chilling. Priya: Okay cool, see you tomorrow." -> 0 memories.
     * "Things are messy right now." -> 0 memories.
     * "The weather is nice." -> 0 memories.
     * "Okay cool. Things are a bit messy here." -> 0 memories.
     * "Have fun guys." -> 0 memories.
     * "I'm busy today." -> 0 memories.
     * "That meeting was great." -> 0 memories.
     * "You don't want to forget." -> 0 memories.

   - Examples that MAY become memories:
     * "Anshika is handling the design." -> Person: "Anshika", Content: "Handling the design"
     * "Akshay is responsible for the backend." -> Person: "Akshay", Content: "Responsible for the backend"
     * "Mobile app checkout needs the address validation step." -> Context: "Mobile app checkout", Content: "Needs address validation step"
     * "Lab sessions are in Block C, room 204." -> Context: "Lab sessions", Content: "Block C, room 204"
     * "Professor said Assignment 3 is due Sunday." -> Deadline: "Assignment 3", Content: "Sunday" (or Person: "Professor")

   - Only extract entities explicitly present in the text with exact verbatim evidence quotes.`;


  const userPrompt = `Input text to extract:\n"${content}"`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        format: extractionJsonSchema,
        options: {
          temperature: 0.1,
          num_predict: 2048,
        },
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new ExtractionError("AI request timed out. Please try again.");
    }
    throw new ExtractionError("Could not reach Ollama AI service. Please ensure Ollama is running.", err);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ExtractionError(`AI service returned error (${response.status}): ${errorText}`);
  }

  let rawContent = "";
  try {
    const result = await response.json();
    rawContent = result?.message?.content || "";
  } catch (err: unknown) {
    throw new ExtractionError("Failed to parse AI service response.", err);
  }

  const cleaned = cleanJsonResponse(rawContent);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: unknown) {
    throw new ExtractionError("AI returned invalid JSON output.", err);
  }

  const initialValidation = extractionSchema.safeParse(parsed);
  if (initialValidation.success) {
    return sanitizeAndValidateResult(initialValidation.data, content);
  }

  const normalized = normalizeResult(parsed, content);
  const normalizedValidation = extractionSchema.safeParse(normalized);
  if (normalizedValidation.success) {
    return sanitizeAndValidateResult(normalizedValidation.data, content);
  }

  throw new ExtractionError("Extracted data did not meet required format.");
}
