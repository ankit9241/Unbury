export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";
export const APP_REFERENCE_DATE = (typeof process !== "undefined" && process.env?.APP_REFERENCE_DATE) || "2026-10-02";

export function getAppReferenceDate(): Date {
  const refStr = (typeof process !== "undefined" && process.env?.APP_REFERENCE_DATE) || "2026-10-02";
  return new Date(`${refStr}T12:00:00+05:30`);
}

export function getCurrentDateContext(timezone: string = APP_TIMEZONE) {
  const now = getAppReferenceDate();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(now);

  const currentIso = now.toISOString();

  return {
    currentDate: dateStr,
    dayOfWeek,
    currentIso,
    timezone,
  };
}

export function getCalendarReference(
  referenceDate: Date = getAppReferenceDate(),
  timezone: string = APP_TIMEZONE
): string {
  const lines: string[] = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(referenceDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    }).format(d);
    if (i === 0) lines.push(`- Today (${weekday}): ${dateStr}`);
    else if (i === 1) lines.push(`- Tomorrow (${weekday}): ${dateStr}`);
    else lines.push(`- ${weekday}: ${dateStr}`);
  }
  return lines.join("\n");
}

/**
 * Returns true when a deadline string contains a specific clock time.
 * Date-only strings like "2026-10-03" return false.
 * Strings with "T" or ":" or am/pm return true.
 */
export function deadlineHasTime(deadlineStr: string | null | undefined): boolean {
  if (!deadlineStr) return false;
  const trimmed = deadlineStr.trim();
  if (!trimmed) return false;
  // Pure date-only: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  // Contains time separator
  if (trimmed.includes("T") || trimmed.includes(":")) return true;
  // Contains am/pm
  if (/\b(am|pm|a\.m\.|p\.m\.)\b/i.test(trimmed)) return true;
  // Contains noon/midnight
  if (/\b(noon|midnight)\b/i.test(trimmed)) return true;
  return false;
}

/**
 * Parses explicit reminder offset expressions from text.
 * e.g.:
 * - "remind me 15 minutes before" -> "15 minutes before"
 * - "remind me 1 hour before" -> "1 hour before"
 * - "remind me a day before" -> "1 day before"
 * - "remind me 3 hours before" -> "3 hours before"
 * Returns null if no explicit reminder offset is specified.
 */
export function parseReminderOffset(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 15 minutes before / 15 mins before / 15 min before
  if (
    /\b(?:remind\s+(?:me\s+)?(?:about\s+it\s+)?)?(?:15|fifteen)\s*(?:minutes?|mins?|m)\s+(?:before|prior|earlier|ahead)\b/i.test(lower) ||
    /\b(?:15|fifteen)\s*(?:minutes?|mins?|m)\s+reminder\b/i.test(lower)
  ) {
    return "15 minutes before";
  }

  // 1 hour before / an hour before
  if (
    /\b(?:remind\s+(?:me\s+)?(?:about\s+it\s+)?)?(?:1|one|an?)\s*(?:hour|hr)s?\s+(?:before|prior|earlier|ahead)\b/i.test(lower) ||
    /\b(?:1|one|an?)\s*(?:hour|hr)\s+reminder\b/i.test(lower)
  ) {
    return "1 hour before";
  }

  // 3 hours before
  if (
    /\b(?:remind\s+(?:me\s+)?(?:about\s+it\s+)?)?(?:3|three)\s*(?:hours|hrs)\s+(?:before|prior|earlier|ahead)\b/i.test(lower) ||
    /\b(?:3|three)\s*(?:hours|hrs)\s+reminder\b/i.test(lower)
  ) {
    return "3 hours before";
  }

  // 1 day before / a day before
  if (
    /\b(?:remind\s+(?:me\s+)?(?:about\s+it\s+)?)?(?:1|one|a)\s*day\s+(?:before|prior|earlier|ahead)\b/i.test(lower) ||
    /\b(?:1|one|a)\s*day\s+reminder\b/i.test(lower)
  ) {
    return "1 day before";
  }

  // 3 days before
  if (
    /\b(?:remind\s+(?:me\s+)?(?:about\s+it\s+)?)?(?:3|three)\s*days?\s+(?:before|prior|earlier|ahead)\b/i.test(lower) ||
    /\b(?:3|three)\s*days?\s+reminder\b/i.test(lower)
  ) {
    return "3 days before";
  }

  return null;
}

export function classifyDeadlineToBucket(
  deadlineStr: string | null,
  referenceDate: Date = getAppReferenceDate(),
  timezone: string = APP_TIMEZONE
): { when: string; bucket: "today" | "tomorrow" | "week" | "next" } {
  if (!deadlineStr) {
    return { when: "No deadline", bucket: "today" };
  }

  const trimmed = deadlineStr.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  let targetDate: Date;
  let hasSpecificTime = false;
  let targetParts: [number, number, number];

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    targetParts = [year, month, day];
    targetDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    hasSpecificTime = false;
  } else {
    targetDate = new Date(trimmed);
    if (isNaN(targetDate.getTime())) {
      return { when: deadlineStr, bucket: "today" };
    }
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(targetDate);
    const [y, m, d] = formatted.split("-").map(Number);
    targetParts = [y, m, d];
    hasSpecificTime = trimmed.includes("T") || trimmed.includes(":");
  }

  const refParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(referenceDate)
    .split("-")
    .map(Number);

  const refMidnight = Date.UTC(refParts[0], refParts[1] - 1, refParts[2]);
  const targetMidnight = Date.UTC(targetParts[0], targetParts[1] - 1, targetParts[2]);

  const diffDays = Math.round((targetMidnight - refMidnight) / (1000 * 60 * 60 * 24));

  const timeFormatted = hasSpecificTime
    ? targetDate.toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  let bucket: "today" | "tomorrow" | "week" | "next" = "today";
  let when = "";

  if (diffDays <= 0) {
    bucket = "today";
    if (diffDays === 0) {
      when = timeFormatted ? `Today · ${timeFormatted}` : "Today";
    } else {
      when = timeFormatted ? `Past due · ${timeFormatted}` : "Past due";
    }
  } else if (diffDays === 1) {
    bucket = "tomorrow";
    when = timeFormatted ? `Tomorrow · ${timeFormatted}` : "Tomorrow";
  } else if (diffDays > 1 && diffDays <= 7) {
    bucket = "week";
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    }).format(targetDate);
    when = timeFormatted ? `${weekday} · ${timeFormatted}` : weekday;
  } else {
    bucket = "next";
    const dateFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(targetDate);
    when = timeFormatted ? `${dateFormatted} · ${timeFormatted}` : dateFormatted;
  }

  return { when, bucket };
}

export type TaskSectionKey = "overdue" | "today" | "tomorrow" | "upcoming" | "no_deadline";

export interface TaskDeadlineClassification {
  section: TaskSectionKey;
  when: string;
  sortKey: number;
}

export function classifyTaskDeadline(
  deadlineStr: string | null | undefined,
  referenceDate: Date = getAppReferenceDate(),
  timezone: string = APP_TIMEZONE
): TaskDeadlineClassification {
  if (!deadlineStr || !deadlineStr.trim()) {
    return {
      section: "no_deadline",
      when: "No deadline",
      sortKey: Infinity,
    };
  }

  const trimmed = deadlineStr.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  // Extract reference date calendar parts in user's timezone (Asia/Kolkata)
  const refParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(referenceDate)
    .split("-")
    .map(Number);

  const refMidnight = Date.UTC(refParts[0], refParts[1] - 1, refParts[2]);

  let targetParts: [number, number, number];
  let hasSpecificTime = false;
  let targetExactDate: Date;

  if (dateOnlyMatch) {
    const y = Number(dateOnlyMatch[1]);
    const m = Number(dateOnlyMatch[2]);
    const d = Number(dateOnlyMatch[3]);
    targetParts = [y, m, d];
    hasSpecificTime = false;
    targetExactDate = new Date(`${trimmed}T23:59:59+05:30`);
  } else {
    const spaceTimeMatch = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
    if (spaceTimeMatch) {
      const [, d, h, m, s = "00"] = spaceTimeMatch;
      targetExactDate = new Date(
        `${d}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}+05:30`
      );
    } else {
      targetExactDate = new Date(trimmed);
    }

    if (isNaN(targetExactDate.getTime())) {
      return {
        section: "no_deadline",
        when: deadlineStr,
        sortKey: Infinity,
      };
    }

    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(targetExactDate);
    const [y, m, d] = formatted.split("-").map(Number);
    targetParts = [y, m, d];
    hasSpecificTime = trimmed.includes("T") || trimmed.includes(":") || /am|pm/i.test(trimmed);
  }

  const targetMidnight = Date.UTC(targetParts[0], targetParts[1] - 1, targetParts[2]);
  const diffDays = Math.round((targetMidnight - refMidnight) / (1000 * 60 * 60 * 24));

  const timeFormatted = hasSpecificTime
    ? targetExactDate.toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  const sortKey = targetExactDate.getTime();

  // 1. OVERDUE
  if (diffDays < 0) {
    let when = "Past due";
    if (diffDays === -1) {
      when = timeFormatted ? `Past due · Yesterday at ${timeFormatted}` : "Past due · Yesterday";
    } else {
      const shortDate = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
      }).format(targetExactDate);
      when = timeFormatted ? `Past due · ${shortDate} at ${timeFormatted}` : `Past due · ${shortDate}`;
    }
    return {
      section: "overdue",
      when,
      sortKey,
    };
  }

  // Same calendar date (diffDays === 0)
  if (diffDays === 0) {
    if (hasSpecificTime && targetExactDate.getTime() < referenceDate.getTime()) {
      return {
        section: "overdue",
        when: `Past due · ${timeFormatted}`,
        sortKey,
      };
    }

    // 2. TODAY
    return {
      section: "today",
      when: timeFormatted ? `Today · ${timeFormatted}` : "Today",
      sortKey,
    };
  }

  // 3. TOMORROW (diffDays === 1)
  if (diffDays === 1) {
    return {
      section: "tomorrow",
      when: timeFormatted ? `Tomorrow · ${timeFormatted}` : "Tomorrow",
      sortKey,
    };
  }

  // 4. UPCOMING (diffDays > 1)
  let whenUpcoming = "";
  if (diffDays <= 7) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    }).format(targetExactDate);
    whenUpcoming = timeFormatted ? `${weekday} · ${timeFormatted}` : weekday;
  } else {
    const dateFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(targetExactDate);
    whenUpcoming = timeFormatted ? `${dateFormatted} · ${timeFormatted}` : dateFormatted;
  }

  return {
    section: "upcoming",
    when: whenUpcoming,
    sortKey,
  };
}

export interface TaskGroup<T = import("./data").Task> {
  key: TaskSectionKey;
  label: string;
  tasks: T[];
  aside?: string;
}

export function groupTasksByDeadline<T extends { id: string; title: string; deadline?: string | null; when: string }>(
  tasks: T[],
  referenceDate: Date = getAppReferenceDate(),
  timezone: string = APP_TIMEZONE
): TaskGroup<T>[] {
  const sections: Record<
    TaskSectionKey,
    { label: string; items: Array<{ task: T; sortKey: number }>; aside?: string }
  > = {
    overdue: { label: "Overdue", items: [] },
    today: { label: "Today", items: [] },
    tomorrow: { label: "Tomorrow", items: [] },
    upcoming: { label: "Upcoming", items: [] },
    no_deadline: { label: "No deadline", items: [] },
  };

  tasks.forEach((task, index) => {
    const deadlineVal = task.deadline !== undefined ? task.deadline : null;
    const { section, when, sortKey } = classifyTaskDeadline(deadlineVal, referenceDate, timezone);

    const updatedTask: T = {
      ...task,
      when: task.when && task.deadline ? when : (task.when || when),
    };

    const finalSortKey = section === "no_deadline" ? index : sortKey;
    sections[section].items.push({ task: updatedTask, sortKey: finalSortKey });
  });

  const keys: TaskSectionKey[] = ["overdue", "today", "tomorrow", "upcoming", "no_deadline"];
  return keys.map((key) => ({
    key,
    label: sections[key].label,
    tasks: sections[key].items
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((item) => item.task),
  }));
}

