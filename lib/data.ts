export type Priority = "High" | "Medium" | "Low";
export type Bucket = "today" | "tomorrow" | "week" | "next";

export interface Reminder {
  label: string;
  enabled: boolean;
  kind?: "primary" | "follow_up";
}

export interface TaskConflict {
  id: string;
  currentDeadline: string;
  newDeadline: string;
  currentEvidence: string;
  newEvidence: string;
  options?: { date: string; label: string; quote: string }[];
  resolved?: string | null;
}

export interface Task {
  id: string;
  title: string;
  deadline?: string | null;
  when: string;
  context?: string;
  bucket: Bucket;
  priority: Priority;
  status: "Not started" | "In progress" | "Done";
  done: boolean;
  important?: boolean;
  why: string;
  sourceId?: string | null;
  sourceType?: "Text" | "Image" | "PDF" | "Audio";
  sourcePreview?: string;
  evidence?: string;
  source: { quote: string; captured: string; type?: string; preview?: string };
  reminders: Reminder[];
  followUpEnabled?: boolean;
  conflict?: TaskConflict | null;
}

const reminders = (...labels: string[]): Reminder[] => labels.map((label) => ({ label, enabled: true }));

export const initialTasks: Task[] = [
  {
    id: "dbms",
    title: "Submit DBMS Assignment 3",
    deadline: "2026-10-02T23:59:00+05:30",
    when: "Due today · 11:59 PM",
    context: "DBMS class group",
    bucket: "today",
    priority: "High",
    status: "Not started",
    done: false,
    important: true,
    why: "Your class group message said: Submit Assignment 3 by Sunday night.",
    source: { quote: "Assignment 3 has been uploaded. Please submit it by Sunday night.", captured: "Captured from screenshot · Oct 2" },
    reminders: reminders("3 days before", "1 day before", "3 hours before"),
    conflict: {
      id: "mock-conflict",
      currentDeadline: "Oct 2",
      newDeadline: "Oct 3",
      currentEvidence: "Assignment 3 due this Friday, no extensions.",
      newEvidence: "Update: you can submit Assignment 3 by Sunday night.",
      options: [
        { date: "Oct 2", label: "Friday", quote: "Assignment 3 due this Friday, no extensions." },
        { date: "Oct 3", label: "Sunday", quote: "Update: you can submit Assignment 3 by Sunday night." },
      ],
    },
  },
  {
    id: "rahul",
    title: "Call Rahul about the Basera landing page",
    deadline: "2026-10-02T17:00:00+05:30",
    when: "Today · 5:00 PM",
    context: "WhatsApp · Rahul",
    bucket: "today",
    priority: "Medium",
    status: "Not started",
    done: false,
    why: "Rahul asked you to call once you'd reviewed the new hero section.",
    source: { quote: "Can you call me around 5 once you've seen the new hero? Want to lock it today.", captured: "Captured from pasted message · Oct 2" },
    reminders: reminders("1 hour before", "15 minutes before"),
  },
  {
    id: "rent",
    title: "Transfer rent to Meera",
    deadline: "2026-10-02T21:00:00+05:30",
    when: "Today · before 9:00 PM",
    context: "Flatmates group",
    bucket: "today",
    priority: "Medium",
    status: "Not started",
    done: false,
    why: "Meera reminded the flat that rent is due on the 2nd.",
    source: { quote: "Rent for October by tonight please — same UPI as last month.", captured: "Captured from screenshot · Oct 1" },
    reminders: reminders("3 hours before"),
  },
  {
    id: "prev",
    title: "Bring previous assignment",
    deadline: "2026-10-03T10:00:00+05:30",
    when: "Tomorrow · 10:00 AM",
    context: "Prof. Sharma",
    bucket: "tomorrow",
    priority: "Low",
    status: "Not started",
    done: false,
    why: "Prof. Sharma asked everyone to bring their graded Assignment 2 to lab.",
    source: { quote: "Bring your graded Assignment 2 to tomorrow's lab session.", captured: "Captured from PDF · Oct 2" },
    reminders: reminders("Evening before", "1 hour before"),
  },
  {
    id: "passport",
    title: "Book passport appointment",
    deadline: "2026-10-03",
    when: "Tomorrow",
    context: "Note to self",
    bucket: "tomorrow",
    priority: "Medium",
    status: "Not started",
    done: false,
    why: "You noted slots open up on Saturday mornings.",
    source: { quote: "passport slots open sat morning — book before they're gone", captured: "Captured from text · Sep 30" },
    reminders: reminders("9:00 AM"),
  },
  {
    id: "basera",
    title: "Send Basera revised proposal",
    deadline: "2026-10-07T18:00:00+05:30",
    when: "Wednesday · 6:00 PM",
    context: "Email · Basera",
    bucket: "week",
    priority: "High",
    status: "In progress",
    done: false,
    important: true,
    why: "The Basera team asked for a revised quote before their Thursday review.",
    source: { quote: "Could you share the revised proposal before Thursday's review?", captured: "Captured from email · Oct 1" },
    reminders: reminders("1 day before", "3 hours before"),
  },
  {
    id: "mom",
    title: "Mom's birthday dinner reservation",
    deadline: "2026-10-09T20:00:00+05:30",
    when: "Friday · 8:00 PM",
    context: "Family group",
    bucket: "week",
    priority: "Medium",
    status: "Not started",
    done: false,
    why: "Your sister suggested you handle the reservation this year.",
    source: { quote: "You book the place this time? Friday 8 works for everyone.", captured: "Captured from screenshot · Sep 29" },
    reminders: reminders("2 days before"),
  },
  {
    id: "midsem",
    title: "Operating Systems mid-sem exam",
    deadline: "2026-10-12T09:30:00+05:30",
    when: "Monday, Oct 12 · 9:30 AM",
    context: "Exam schedule PDF",
    bucket: "next",
    priority: "High",
    status: "Not started",
    done: false,
    important: true,
    why: "Found in the mid-semester exam schedule you uploaded.",
    source: { quote: "CS301 Operating Systems — 12 Oct, 9:30 AM, Hall B", captured: "Captured from PDF · Sep 28" },
    reminders: reminders("1 week before", "2 days before", "Evening before"),
  },
  {
    id: "insurance",
    title: "Renew bike insurance",
    deadline: "2026-10-15",
    when: "Thursday, Oct 15",
    context: "SMS · Insurer",
    bucket: "next",
    priority: "Low",
    status: "Not started",
    done: false,
    why: "Your insurer sent a renewal notice for policy ending Oct 15.",
    source: { quote: "Your two-wheeler policy expires on 15-Oct. Renew now to avoid lapse.", captured: "Captured from pasted message · Sep 27" },
    reminders: reminders("5 days before"),
  },
];

export interface Memory {
  id: string;
  title: string;
  detail: string;
  meta: string;
  source: string;
  sourceType?: "Text" | "Image" | "PDF" | "Audio";
  sourcePreview?: string;
  evidence?: string;
  taskId?: string | null;
  taskTitle?: string | null;
  sourceId?: string | null;
  createdAt?: string;
}

export const memories: Record<"People" | "Deadlines" | "Context", Memory[]> = {
  People: [
    { id: "p1", title: "Rahul", detail: "Basera landing page discussion", meta: "Last mentioned 2 days ago", source: "WhatsApp" },
    { id: "p2", title: "Prof. Sharma", detail: "DBMS lab · prefers printed submissions", meta: "Last mentioned today", source: "PDF" },
    { id: "p3", title: "Meera", detail: "Flatmate · collects rent on the 2nd", meta: "Last mentioned yesterday", source: "Screenshot" },
  ],
  Deadlines: [
    { id: "d1", title: "DBMS Assignment 3", detail: "Sunday · 11:59 PM", meta: "Conflicting dates found", source: "Screenshot" },
    { id: "d2", title: "OS mid-sem exam", detail: "Oct 12 · 9:30 AM · Hall B", meta: "10 days away", source: "PDF" },
    { id: "d3", title: "Bike insurance", detail: "Oct 15", meta: "13 days away", source: "SMS" },
  ],
  Context: [
    { id: "c1", title: "Basera prefers warm, earthy visuals", detail: "From the kickoff call notes", meta: "Remembered Sep 24", source: "Text" },
    { id: "c2", title: "Rent goes to the same UPI as last month", detail: "meera@okaxis", meta: "Remembered Oct 1", source: "Screenshot" },
    { id: "c3", title: "Lab sessions are in Block C, room 204", detail: "Tuesdays and Thursdays", meta: "Remembered Sep 20", source: "PDF" },
  ],
};

export type DumpKind = "Text" | "Screenshot" | "PDF" | "Voice";

export interface Dump {
  id: string;
  kind: DumpKind;
  preview: string;
  time: string;
  state: "processing" | "review" | "processed";
  result?: string;
}

export const initialDumps: Dump[] = [
  { id: "x1", kind: "Screenshot", preview: "DBMS class group", time: "2 minutes ago", state: "review", result: "2 tasks found · 1 deadline" },
  { id: "x2", kind: "Text", preview: "Can you call me around 5 once you've seen…", time: "1 hour ago", state: "processed", result: "1 task found" },
  { id: "x3", kind: "PDF", preview: "Mid-semester exam schedule.pdf", time: "4 days ago", state: "processed", result: "6 deadlines" },
  { id: "x4", kind: "Voice", preview: "Note about passport appointment", time: "Sep 30", state: "processed", result: "1 task found" },
];
