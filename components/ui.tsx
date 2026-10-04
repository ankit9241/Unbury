"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, FileText, Mic, Paperclip, Square, X } from "lucide-react";
import type { DumpKind, Memory, Task, Priority } from "@/lib/data";
import type { DumpProposal, ProposedTask, ProposedMemory } from "@/lib/pipeline";
import { classifyDeadlineToBucket, deadlineHasTime } from "@/lib/date";
import { useUnbury } from "@/lib/store";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[18px] font-semibold tracking-[-0.03em]">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M1.5 13H6Q9 13 9 10M12 13h4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="9" cy="5.5" r="2.6" fill="var(--primary)" />
      </svg>
      unbury
    </span>
  );
}

export function Thinking({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      {label}
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((index) => <span key={index} className="thinking-dot h-1 w-1 rounded-full bg-primary" style={{ animationDelay: `${index * 0.16}s` }} />)}
      </span>
    </span>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-14">
      <h1 className="text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] md:text-[46px]">{title}</h1>
      {sub && <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted-foreground">{sub}</p>}
    </header>
  );
}

export function Section({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-16">
      <div className="mb-1 flex items-baseline justify-between border-b border-foreground/80 pb-3">
        <h2 className="eyebrow text-foreground">{label}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SourceMark({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-faint">
      <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
        <path d="M1 0V5Q1 8 4 8h6" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="11.5" cy="8" r="1.5" fill="currentColor" />
      </svg>
      {label}
    </span>
  );
}

export function ConvergeMark() {
  return (
    <svg width="120" height="28" viewBox="0 0 120 28" className="text-border-strong" aria-hidden="true">
      {[[4, 4], [14, 22], [22, 9], [33, 18], [44, 6], [52, 21]].map(([x, y], index) => <circle key={index} cx={x} cy={y} r="1.6" fill="currentColor" opacity={0.5 + index * 0.08} />)}
      <path d="M58 14Q64 14 70 14h42" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="114" cy="14" r="2.4" fill="var(--primary)" />
    </svg>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-14">
      <ConvergeMark />
      <p className="mt-6 text-[20px] font-semibold tracking-[-0.015em]">{title}</p>
      <p className="mt-1.5 text-[15px] text-muted-foreground">{body}</p>
    </div>
  );
}

export function TaskRow({ task }: { task: Task }) {
  const { open, toggleDone } = useUnbury();
  const conflict = task.conflict && !task.conflict.resolved;
  const marked = (task.important || task.priority === "High") && !task.done;

  return (
    <div className={`group relative flex items-start gap-5 border-b border-border py-5 last:border-b-0 ${task.done ? "opacity-55" : ""}`}>
      <span aria-hidden="true" className="absolute bottom-0 left-[8px] top-0 w-px bg-border group-first:top-6" />
      <button onClick={() => toggleDone(task.id)} aria-label={task.done ? "Mark as not done" : "Mark as done"} className={`relative z-10 mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border bg-background transition-colors ${task.done ? "border-border-strong" : marked ? "border-primary hover:bg-primary-soft" : "border-border-strong hover:border-primary"}`}>
        {(task.done || marked) && <span className={`h-[7px] w-[7px] rounded-full ${task.done ? "bg-faint" : "bg-primary"}`} />}
      </button>
      <button onClick={() => open(task.id)} className="min-w-0 flex-1 text-left">
        <p className={`text-[16px] font-medium leading-snug tracking-[-0.005em] transition-colors group-hover:text-primary-deep ${task.done ? "font-normal text-muted-foreground" : ""}`}>{task.title}</p>
        <p className={`mt-1 text-[14px] ${marked ? "text-primary-deep" : "text-muted-foreground"}`}>{task.when}</p>
        {(task.context || conflict) && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            {task.context ? <SourceMark label={task.context} /> : <span />}
            {conflict && task.conflict && (
              <span className="inline-flex items-center gap-2 text-[12px] text-primary-deep">
                <span className="h-px w-4 bg-primary" />
                <span className="eyebrow text-primary">Conflict</span>
                <span>
                  {task.conflict.currentDeadline || task.conflict.options?.[0]?.label} →{" "}
                  {task.conflict.newDeadline || task.conflict.options?.[1]?.label}
                </span>
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}

export function ProposalConfirmationModal({
  proposal,
  onConfirm,
  onDiscard,
}: {
  proposal: DumpProposal;
  onConfirm: (confirmed: {
    sourceId: string;
    tasks: Array<{
      title: string;
      description?: string;
      deadline?: string | null;
      priority?: Priority;
      evidence: string;
      reminder?: string | null;
    }>;
    memories: Array<{
      type: "person" | "deadline" | "context";
      title: string;
      content: string;
      evidence: string;
    }>;
  }) => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const [tasks, setTasks] = useState<ProposedTask[]>(proposal.tasks);
  const [includeMemories, setIncludeMemories] = useState(true);
  const [activeDeadlinePicker, setActiveDeadlinePicker] = useState<string | null>(null);
  const [activeReminderPicker, setActiveReminderPicker] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateTitle = (tempId: string, newTitle: string) => {
    setTasks((prev) => prev.map((t) => (t.tempId === tempId ? { ...t, title: newTitle } : t)));
  };

  const removeTask = (tempId: string) => {
    setTasks((prev) => prev.filter((t) => t.tempId !== tempId));
  };

  const setTaskDeadline = (tempId: string, deadlineStr: string | null) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.tempId !== tempId) return t;
        const { when, bucket } = classifyDeadlineToBucket(deadlineStr);
        const hasTime = deadlineHasTime(deadlineStr);
        const reminder = deadlineStr && hasTime ? (t.reminder || "3 hours before") : null;
        return {
          ...t,
          deadline: deadlineStr,
          when,
          bucket,
          reminder,
          remindersEnabled: Boolean(deadlineStr) && hasTime,
        };
      })
    );
    setActiveDeadlinePicker(null);
  };

  const setTaskReminder = (tempId: string, reminderLabel: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.tempId === tempId ? { ...t, reminder: reminderLabel } : t))
    );
    setActiveReminderPicker(null);
  };

  const toggleFollowUp = (tempId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.tempId === tempId ? { ...t, followUpEnabled: !t.followUpEnabled } : t))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onConfirm({
        sourceId: proposal.sourceId,
        tasks: tasks.map((t) => ({
          title: t.title,
          description: t.description,
          deadline: t.deadline,
          priority: t.priority,
          evidence: t.evidence,
          reminder: t.reminder,
          followUpEnabled: Boolean(t.followUpEnabled),
        })),
        memories: includeMemories
          ? proposal.memories.map((m) => ({
              type: m.type,
              title: m.title,
              content: m.content,
              evidence: m.evidence,
            }))
          : [],
      });
    } finally {
      setSaving(false);
    }
  };

  const hasTasks = tasks.length > 0;
  const headerText = hasTasks
    ? tasks.length === 1
      ? "I found 1 task"
      : `I found ${tasks.length} tasks`
    : proposal.memories.length > 0
      ? `I found ${proposal.memories.length} ${proposal.memories.length === 1 ? "detail" : "details"} to remember`
      : "No tasks found";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Discard proposal"
        onClick={onDiscard}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="drawer-in relative w-full max-w-[540px] max-h-[90vh] overflow-y-auto border border-border bg-surface p-7 shadow-2xl md:p-8"
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <p className="eyebrow text-foreground">{headerText}</p>
          <button
            onClick={onDiscard}
            disabled={saving}
            className="rounded p-1 text-faint hover:text-foreground"
            aria-label="Discard"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tasks List */}
        {hasTasks && (
          <div className="mt-5 space-y-6">
            {tasks.map((task, idx) => (
              <div key={task.tempId} className="relative border-b border-border pb-6 last:border-b-0 last:pb-0">
                {tasks.length > 1 && (
                  <div className="mb-2 flex items-center justify-between text-[12px] text-faint">
                    <span>Task {idx + 1}</span>
                    <button
                      onClick={() => removeTask(task.tempId)}
                      className="flex items-center gap-1 text-faint hover:text-primary"
                      aria-label="Remove task"
                    >
                      <X className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                )}

                {/* Editable Task Title */}
                <input
                  type="text"
                  value={task.title}
                  onChange={(e) => updateTitle(task.tempId, e.target.value)}
                  className="w-full bg-transparent text-[20px] font-semibold leading-snug tracking-[-0.015em] outline-none border-b border-transparent hover:border-border focus:border-primary pb-1 transition-colors text-foreground"
                  placeholder="Task title"
                />

                {/* Deadline */}
                <div className="mt-4">
                  <p className="eyebrow text-faint mb-1">Deadline</p>
                  {task.deadline ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-medium text-foreground">{task.when}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveDeadlinePicker(
                              activeDeadlinePicker === task.tempId ? null : task.tempId
                            )
                          }
                          className="text-[13px] font-medium text-primary hover:text-primary-deep"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskDeadline(task.tempId, null)}
                          className="text-[13px] text-faint hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] text-muted-foreground">No deadline found</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDeadlinePicker(
                            activeDeadlinePicker === task.tempId ? null : task.tempId
                          )
                        }
                        className="text-[13px] font-medium text-primary hover:text-primary-deep"
                      >
                        + Add deadline
                      </button>
                    </div>
                  )}

                  {/* Inline Deadline Picker */}
                  {activeDeadlinePicker === task.tempId && (
                    <div className="mt-3 p-3 bg-background border border-border space-y-2.5">
                      <p className="text-[12px] text-faint">Select quick deadline or custom date/time:</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 1);
                            d.setHours(17, 0, 0, 0);
                            setTaskDeadline(task.tempId, d.toISOString());
                          }}
                          className="rounded border border-border px-2.5 py-1 text-[12px] hover:border-primary"
                        >
                          Tomorrow · 5 PM
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            const day = d.getDay();
                            const diff = (8 - day) % 7 || 7;
                            d.setDate(d.getDate() + diff);
                            d.setHours(18, 0, 0, 0);
                            setTaskDeadline(task.tempId, d.toISOString());
                          }}
                          className="rounded border border-border px-2.5 py-1 text-[12px] hover:border-primary"
                        >
                          Monday · 6 PM
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 1);
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, "0");
                            const dayStr = String(d.getDate()).padStart(2, "0");
                            setTaskDeadline(task.tempId, `${y}-${m}-${dayStr}`);
                          }}
                          className="rounded border border-border px-2.5 py-1 text-[12px] hover:border-primary"
                        >
                          Tomorrow (Date only)
                        </button>
                      </div>
                      <div className="pt-1 flex items-center gap-2">
                        <input
                          type="datetime-local"
                          onChange={(e) => {
                            if (e.target.value) {
                              setTaskDeadline(task.tempId, e.target.value);
                            }
                          }}
                          className="bg-transparent text-[13px] border border-border px-2 py-1 outline-none focus:border-primary text-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => setActiveDeadlinePicker(null)}
                          className="text-[12px] text-faint hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reminder */}
                <div className="mt-4">
                  <p className="eyebrow text-faint mb-1">Reminder</p>
                  {!task.deadline ? (
                    <span className="text-[14px] text-muted-foreground">
                      No reminder until a deadline is set.
                    </span>
                  ) : !deadlineHasTime(task.deadline) ? (
                    <span className="text-[14px] text-muted-foreground">
                      No reminder until a time is set.
                    </span>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-medium text-foreground">
                          {task.reminder || "3 hours before"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveReminderPicker(
                              activeReminderPicker === task.tempId ? null : task.tempId
                            )
                          }
                          className="text-[13px] font-medium text-primary hover:text-primary-deep"
                        >
                          Change
                        </button>
                      </div>

                      {task.reminder && task.reminder !== "None" && (
                        <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground">
                          <input
                            type="checkbox"
                            checked={Boolean(task.followUpEnabled)}
                            onChange={() => toggleFollowUp(task.tempId)}
                            className="rounded border-border text-primary focus:ring-0"
                          />
                          <span>Remind me again if unfinished</span>
                        </label>
                      )}
                    </div>
                  )}

                  {/* Inline Reminder Picker */}
                  {activeReminderPicker === task.tempId && task.deadline && (
                    <div className="mt-3 p-2 bg-background border border-border space-y-1">
                      {["15 minutes before", "1 hour before", "3 hours before", "1 day before", "None"].map(
                        (opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setTaskReminder(task.tempId, opt)}
                            className={`block w-full text-left px-2.5 py-1 text-[13px] rounded transition-colors ${
                              task.reminder === opt
                                ? "bg-primary/10 text-primary font-medium"
                                : "hover:bg-surface text-foreground"
                            }`}
                          >
                            {opt}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Source */}
                <div className="mt-4">
                  <p className="eyebrow text-faint mb-1">Source</p>
                  <p className="text-[13px] text-muted-foreground">
                    {proposal.source.kind}
                    {task.evidence ? ` · "${task.evidence}"` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* People / Memories Context */}
        {proposal.memories.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-muted-foreground">
                I also noticed {proposal.memories.length}{" "}
                {proposal.memories.length === 1 ? "detail" : "people / details"} mentioned:
              </p>
              <button
                type="button"
                onClick={() => setIncludeMemories((v) => !v)}
                className="text-[12px] font-medium text-primary hover:text-primary-deep"
              >
                {includeMemories ? "Dismiss" : "Save with task"}
              </button>
            </div>
            <div className={`mt-2 flex flex-wrap gap-2 ${includeMemories ? "" : "opacity-40"}`}>
              {proposal.memories.map((m) => (
                <span
                  key={m.tempId}
                  className="inline-flex items-center border border-border bg-background px-2.5 py-1 text-[13px]"
                >
                  <span className="font-medium text-foreground">{m.title}</span>
                  {m.content && <span className="ml-1 text-faint font-normal">({m.content})</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
          <button
            type="button"
            disabled={saving}
            onClick={onDiscard}
            className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={
              saving ||
              (tasks.length === 0 && (!includeMemories || proposal.memories.length === 0))
            }
            onClick={handleSave}
            className="rounded bg-foreground px-5 py-2 text-[14px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : tasks.length === 1
                ? "Save task"
                : tasks.length > 1
                  ? `Save ${tasks.length} tasks`
                  : "Save memories"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ExtractionSummary {
  count: number;
  tasks: Task[];
  memories: Array<{ type?: string; title: string; detail?: string; content?: string; evidence?: string }>;
  message?: string;
}


export function DumpComposer({ showModes = false }: { showModes?: boolean }) {
  const { addTasks, addMemories, addDumpItem, open } = useUnbury();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<DumpKind>("Text");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Understanding this");
  const [drag, setDrag] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [fileSelection, setFileSelection] = useState<{ name: string; type: "image" | "pdf" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionSummary | null>(null);
  const [pendingProposal, setPendingProposal] = useState<DumpProposal | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleDumpResponse = (data: {
    isProposal?: boolean;
    proposal?: DumpProposal;
    source?: Parameters<typeof addDumpItem>[0];
    tasks?: Parameters<typeof addTasks>[0];
    memories?: Parameters<typeof addMemories>[0];
    count?: number;
  }) => {
    setText("");
    setFileSelection(null);

    if (data.isProposal && data.proposal) {
      setPendingProposal(data.proposal);
      setResult(null);
    } else {
      if (data.source) {
        addDumpItem(data.source);
      }
      setResult({
        count: 0,
        tasks: [],
        memories: [],
        message: "Saved to Inbox. No actionable tasks found.",
      });
    }
  };

  const handleConfirmProposal = async (confirmed: {
    sourceId: string;
    tasks: Array<{
      title: string;
      description?: string;
      deadline?: string | null;
      priority?: Priority;
      evidence: string;
      reminder?: string | null;
    }>;
    memories: Array<{
      type: "person" | "deadline" | "context";
      title: string;
      content: string;
      evidence: string;
    }>;
  }) => {
    try {
      const response = await fetch("/api/dump/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmed),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to save proposal.");
        return;
      }

      if (Array.isArray(data.tasks) && data.tasks.length > 0) {
        addTasks(data.tasks);
      }
      if (Array.isArray(data.memories) && data.memories.length > 0) {
        addMemories(data.memories);
      }
      if (data.source) {
        addDumpItem(data.source);
      }

      setPendingProposal(null);
      setResult({
        count: data.count || (data.tasks?.length || 0) + (data.memories?.length || 0),
        tasks: data.tasks || [],
        memories: data.memories || [],
        message: `Saved ${data.tasks?.length || 0} task${data.tasks?.length === 1 ? "" : "s"} and ${data.memories?.length || 0} ${data.memories?.length === 1 ? "memory" : "memories"}.`,
      });
    } catch {
      setError("Failed to save proposal. Please try again.");
    }
  };

  const handleDiscardProposal = async () => {
    if (pendingProposal) {
      fetch("/api/dump/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: pendingProposal.sourceId }),
      }).catch(() => {});
    }
    setPendingProposal(null);
  };

  const submitText = async (rawContent: string) => {
    const trimmed = rawContent.trim();
    if (!trimmed || busy || recording) return;

    setBusy(true);
    setBusyLabel("Understanding this");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Couldn't understand that dump. Try again.");
        return;
      }

      handleDumpResponse(data);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitAudio = async (blob: Blob) => {
    setBusy(true);
    setBusyLabel("Transcribing audio");
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("audio", blob, "voice-note.webm");

      const response = await fetch("/api/dump/audio", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Couldn't understand the audio. Try recording again.");
        return;
      }

      handleDumpResponse(data);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
      setBusyLabel("Understanding this");
    }
  };

  const submitImage = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError("Image file too large. Maximum size is 10MB.");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (file.type && !allowed.includes(file.type)) {
      setError("Unsupported image type. Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    setBusy(true);
    setBusyLabel("Extracting text with OCR");
    setError(null);
    setResult(null);
    setFileSelection({ name: file.name, type: "image" });

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/dump/image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Couldn't find readable text in this image.");
        return;
      }

      handleDumpResponse(data);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
      setBusyLabel("Understanding this");
    }
  };

  const submitPdf = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setError("PDF file too large. Maximum size is 20MB.");
      return;
    }

    if (file.type && file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setError("Unsupported file type. Please upload a PDF document.");
      return;
    }

    setBusy(true);
    setBusyLabel("Extracting PDF text");
    setError(null);
    setResult(null);
    setFileSelection({ name: file.name, type: "pdf" });

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("/api/dump/pdf", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Couldn't extract readable text from this PDF.");
        return;
      }

      handleDumpResponse(data);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
      setBusyLabel("Understanding this");
    }
  };

  const startRecording = async () => {
    if (busy || recording) return;
    setError(null);
    setResult(null);

    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
      setError("Audio recording isn't supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        await submitAudio(audioBlob);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setError("Microphone access was denied. Allow microphone access and try again.");
      } else {
        setError("Audio recording isn't supported in this browser.");
      }
    }
  };

  const stopRecording = () => {
    if (!recording || !mediaRecorderRef.current) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    mediaRecorderRef.current.stop();
  };

  const onFile = (file?: File) => {
    if (!file) return;
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      submitPdf(file);
    } else if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)) {
      submitImage(file);
    } else {
      setError("Unsupported file format. Please upload an image or PDF.");
    }
  };

  return (
    <>
      {pendingProposal && (
        <ProposalConfirmationModal
          proposal={pendingProposal}
          onConfirm={handleConfirmProposal}
          onDiscard={handleDiscardProposal}
        />
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          onFile(event.dataTransfer.files[0]);
        }}
        className={`relative border-l-2 bg-surface/70 py-6 pl-6 pr-5 transition-colors md:pl-8 ${
          drag ? "border-primary bg-primary-tint" : "border-border-strong focus-within:border-primary focus-within:bg-surface"
        }`}
      >
        <p className="eyebrow mb-3">Dump something</p>
        {showModes && (
          <div className="mb-4 flex gap-5" role="tablist">
            {(["Text", "Screenshot", "PDF", "Voice"] as DumpKind[]).map((kind) => (
              <button
                key={kind}
                role="tab"
                aria-selected={mode === kind}
                onClick={() => {
                  setMode(kind);
                  if (kind === "Screenshot" || kind === "PDF") fileRef.current?.click();
                  else if (kind === "Voice") {
                    if (recording) stopRecording();
                    else startRecording();
                  }
                }}
                className={`border-b pb-1 text-[13px] font-medium transition-colors ${
                  mode === kind
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
        )}

        {fileSelection && (
          <div className="mb-3 flex items-center gap-2 text-[13px] text-muted-foreground">
            <FileText className="h-4 w-4 text-primary" />
            <span>{fileSelection.name}</span>
            <button
              onClick={() => setFileSelection(null)}
              className="rounded p-0.5 text-faint hover:text-foreground"
              aria-label="Remove file"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <textarea
          disabled={busy || recording}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              submitText(text);
            }
          }}
          rows={2}
          placeholder={
            drag
              ? "Let go to dump it…"
              : recording
                ? "Recording voice note… speak clearly and tap Stop when done."
                : mode === "Voice"
                  ? "Tap the mic and say what happened…"
                  : "Paste a message, drop a screenshot, or tell me what happened…"
          }
          className="block w-full resize-none bg-transparent text-[19px] leading-snug tracking-[-0.01em] outline-none placeholder:text-faint disabled:opacity-60 md:text-[21px]"
        />

        <div className="mt-5 flex items-center justify-between gap-3 text-[13px] text-faint">
          <div className="flex items-center gap-1.5">
            <button
              disabled={busy || recording}
              onClick={() => fileRef.current?.click()}
              className="rounded p-1.5 transition-colors hover:text-foreground disabled:opacity-50"
              aria-label="Attach screenshot or PDF"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {recording ? (
              <button
                onClick={stopRecording}
                className="flex items-center gap-1.5 rounded bg-primary/10 px-2.5 py-1 text-primary hover:bg-primary/20"
                aria-label="Stop recording voice note"
              >
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <Square className="h-3.5 w-3.5 fill-current" />
                <span className="font-mono text-[12px]">
                  {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}
                </span>
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={startRecording}
                className="rounded p-1.5 transition-colors hover:text-foreground disabled:opacity-50"
                aria-label="Record voice note"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}

            <input
              ref={fileRef}
              data-testid="file-upload-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(event) => {
                onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />

            <span className="mx-2 hidden h-3 w-px bg-border-strong sm:block" />
            {busy ? (
              <Thinking label={busyLabel} />
            ) : (
              <span className="hidden sm:inline">Text · screenshots · PDFs · voice</span>
            )}
          </div>

          <button
            onClick={() => submitText(text)}
            disabled={busy || recording || !text.trim()}
            className="flex items-center gap-1 text-[14px] font-medium text-primary transition-colors hover:text-primary-deep disabled:text-faint"
          >
            Dump <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[13px] text-primary">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="rounded p-1 text-faint hover:text-foreground"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {result && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="eyebrow text-foreground">
                {result.message ||
                  (result.count === 0
                    ? "No tasks or memories found"
                    : `Unbury saved ${result.count} ${result.count === 1 ? "thing" : "things"}.`)}
              </p>
              <button
                onClick={() => setResult(null)}
                className="rounded p-1 text-faint hover:text-foreground"
                aria-label="Dismiss confirmation"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {result.count > 0 && (
              <div className="mt-3 space-y-2.5">
                {result.tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => open(task.id)}
                    className="flex w-full items-start justify-between gap-4 border border-border bg-background/80 p-3 text-left transition-colors hover:border-border-strong hover:bg-background"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium leading-snug">{task.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{task.when}</p>
                    </div>
                    <span className="shrink-0 text-[12px] font-medium text-faint hover:text-primary">Inspect →</span>
                  </button>
                ))}
                {result.memories.map((mem, index) => (
                  <div key={index} className="border border-border bg-background/80 p-3">
                    <p className="text-[14px] font-medium">{mem.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{mem.detail || mem.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function Switch({ checked, defaultChecked = false, onChange }: { checked?: boolean; defaultChecked?: boolean; onChange?: (checked: boolean) => void }) {
  const [internal, setInternal] = useState(defaultChecked);
  const active = checked ?? internal;
  const toggle = () => {
    const next = !active;
    if (checked === undefined) setInternal(next);
    onChange?.(next);
  };

  return <button type="button" role="switch" aria-checked={active} onClick={toggle} className={`relative h-5 w-9 rounded-full transition-colors ${active ? "bg-primary" : "bg-border-strong"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${active ? "left-[18px]" : "left-0.5"}`} /></button>;
}

const sourceCache = new Map<string, Promise<{ preview?: string; type?: "Text" | "Image" | "PDF" | "Audio" } | null>>();

function fetchSourceInfo(sourceId: string) {
  if (!sourceCache.has(sourceId)) {
    const promise = fetch(`/api/inbox?id=${encodeURIComponent(sourceId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.source) return null;
        const rawType = (data.source.type || "text").toLowerCase();
        const type: "Text" | "Image" | "PDF" | "Audio" =
          rawType === "image" || rawType === "screenshot"
            ? "Image"
            : rawType === "pdf"
            ? "PDF"
            : rawType === "audio" || rawType === "voice"
            ? "Audio"
            : "Text";
        const preview = data.source.content
          ? data.source.content.replace(/\s+/g, " ").trim().slice(0, 140)
          : undefined;
        return { preview, type };
      })
      .catch(() => null);
    sourceCache.set(sourceId, promise);
  }
  return sourceCache.get(sourceId)!;
}

export function TaskDrawer() {
  const {
    tasks,
    memories,
    openId,
    open,
    toggleReminder,
    resolveConflict,
    toggleDone,
    updateTaskDetails,
    deleteTask,
  } = useUnbury();
  const task = tasks.find((item) => item.id === openId);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [fetchedSource, setFetchedSource] = useState<{
    preview?: string;
    type?: "Text" | "Image" | "PDF" | "Audio";
  } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    setShowDeleteConfirm(false);
  }, [openId]);

  useEffect(() => {
    if (!task) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else if (isEditing) {
          setIsEditing(false);
        } else {
          open(null);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [task, open, showDeleteConfirm, isEditing]);

  useEffect(() => {
    if (task?.sourceId && (!task.sourcePreview || !task.sourceType)) {
      fetchSourceInfo(task.sourceId).then((res) => {
        if (res) setFetchedSource(res);
      });
    } else {
      setFetchedSource(null);
    }
  }, [task?.sourceId, task?.sourcePreview, task?.sourceType]);

  if (!task) return null;

  const allMemories = [...memories.People, ...memories.Deadlines, ...memories.Context];
  const relatedMemories = allMemories.filter((m) => m.taskId === task.id);

  const sourceType =
    task.sourceType ||
    fetchedSource?.type ||
    (task.source?.type as "Text" | "Image" | "PDF" | "Audio") ||
    "Text";
  const sourcePreview = task.sourcePreview || fetchedSource?.preview || task.source?.preview;
  const exactEvidence =
    task.evidence ||
    (task.source?.quote && task.source.quote !== "Captured from source"
      ? task.source.quote
      : undefined);

  const handleStartEdit = () => {
    setEditTitle(task.title);
    setEditDescription(
      task.description ||
        (task.why &&
        !task.why.startsWith("Remembered from:") &&
        !task.why.startsWith("Remembered by")
          ? task.why
          : "")
    );
    setEditDeadline(task.deadline || null);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    setIsSaving(true);
    try {
      const ok = await updateTaskDetails(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        deadline: editDeadline,
      });
      if (ok) {
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    setIsDeleting(true);
    try {
      const ok = await deleteTask(task.id);
      if (ok) {
        open(null);
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close task details"
        onClick={() => open(null)}
        className="absolute inset-0 bg-foreground/15"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-title"
        className="drawer-in absolute bottom-0 right-0 top-0 w-full overflow-y-auto border-l border-border bg-surface shadow-2xl md:max-w-[460px]"
      >
        <div className="px-7 pb-10 pt-6">
          <div className="mb-8 flex items-center justify-between">
            <span className="eyebrow">{isEditing ? "Edit Task" : "Task"}</span>
            <div className="flex items-center gap-3">
              {!isEditing && (
                <>
                  <button
                    onClick={handleStartEdit}
                    className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-[13px] font-medium text-faint hover:text-primary transition-colors"
                  >
                    Delete
                  </button>
                </>
              )}
              <button
                ref={closeButtonRef}
                onClick={() => open(null)}
                aria-label="Close"
                className="rounded p-1 text-faint hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-6">
              <div>
                <label className="eyebrow text-faint mb-1.5 block">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-transparent text-xl font-semibold leading-tight tracking-[-0.015em] outline-none border-b border-border-strong focus:border-primary pb-1 transition-colors text-foreground"
                  placeholder="Task title"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="eyebrow text-faint mb-1.5 block">Deadline</label>
                  {editDeadline && (
                    <button
                      type="button"
                      onClick={() => setEditDeadline(null)}
                      className="text-[12px] text-faint hover:text-foreground mb-1.5"
                    >
                      Clear deadline
                    </button>
                  )}
                </div>
                <p className="text-[14px] font-medium text-foreground mb-2">
                  {editDeadline ? classifyDeadlineToBucket(editDeadline).when : "No deadline set"}
                </p>

                <div className="space-y-2 border border-border bg-background p-3">
                  <p className="text-[11px] uppercase tracking-wider text-faint font-medium">
                    Quick set or custom:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(17, 0, 0, 0);
                        setEditDeadline(d.toISOString());
                      }}
                      className="rounded border border-border px-2.5 py-1 text-[12px] hover:border-primary text-foreground transition-colors"
                    >
                      Tomorrow · 5 PM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        const day = d.getDay();
                        const diff = (8 - day) % 7 || 7;
                        d.setDate(d.getDate() + diff);
                        d.setHours(18, 0, 0, 0);
                        setEditDeadline(d.toISOString());
                      }}
                      className="rounded border border-border px-2.5 py-1 text-[12px] hover:border-primary text-foreground transition-colors"
                    >
                      Monday · 6 PM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, "0");
                        const dayStr = String(d.getDate()).padStart(2, "0");
                        setEditDeadline(`${y}-${m}-${dayStr}`);
                      }}
                      className="rounded border border-border px-2.5 py-1 text-[12px] hover:border-primary text-foreground transition-colors"
                    >
                      Tomorrow (Date only)
                    </button>
                  </div>
                  <div className="pt-1.5 flex items-center gap-2">
                    <input
                      type="datetime-local"
                      onChange={(e) => {
                        if (e.target.value) {
                          setEditDeadline(e.target.value);
                        }
                      }}
                      className="bg-transparent text-[13px] border border-border px-2 py-1 outline-none focus:border-primary text-foreground"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="eyebrow text-faint mb-1.5 block">Description / Notes</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-transparent text-[14px] leading-relaxed border border-border p-2.5 outline-none focus:border-primary text-foreground resize-none"
                  placeholder="Add context or notes for this task..."
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSaving || !editTitle.trim()}
                  onClick={handleSaveEdit}
                  className="flex-1 bg-primary py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsEditing(false)}
                  className="border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2
                id="task-title"
                className="text-2xl font-semibold leading-tight tracking-[-0.015em] break-words"
              >
                {task.title}
              </h2>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[15px] text-muted-foreground">{task.when}</p>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-[13px] font-medium text-primary hover:text-primary-deep transition-colors"
                >
                  Change deadline
                </button>
              </div>
              <div className="mt-6">
                {[
                  ["Status", task.status],
                  ["Priority", task.priority],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between border-b border-border py-3 text-sm"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span
                      className={
                        label === "Priority" && value === "High"
                          ? "font-medium text-primary"
                          : "font-medium"
                      }
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              {task.conflict && !task.conflict.resolved && (
                <div className="mt-8 border-l-2 border-primary bg-primary/5 p-4">
                  <h3 className="eyebrow text-primary">Deadline conflict</h3>
                  <div className="mt-3.5 space-y-3 text-[14px]">
                    <div>
                      <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                        Current:
                      </p>
                      <p className="mt-0.5 font-medium text-foreground break-words">
                        {task.conflict.currentDeadline || task.when}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                        New:
                      </p>
                      <p className="mt-0.5 font-medium text-primary break-words">
                        {task.conflict.newDeadline}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                        Current evidence:
                      </p>
                      <blockquote className="mt-1 border-l border-border-strong pl-3 text-[13px] italic text-muted-foreground leading-relaxed break-words">
                        &ldquo;{task.conflict.currentEvidence || task.source.quote}&rdquo;
                      </blockquote>
                    </div>
                    <div>
                      <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                        New evidence:
                      </p>
                      <blockquote className="mt-1 border-l border-border-strong pl-3 text-[13px] italic text-muted-foreground leading-relaxed break-words">
                        &ldquo;{task.conflict.newEvidence}&rdquo;
                      </blockquote>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => resolveConflict(task.id, task.conflict?.id)}
                    className="mt-4 inline-flex items-center rounded bg-primary px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Use new deadline
                  </button>
                </div>
              )}
              <h3 className="eyebrow mt-10">Why Unbury remembered this</h3>
              <p className="mt-3 text-[15px] leading-relaxed break-words">
                {task.description || task.why}
              </p>
              {relatedMemories.length > 0 && (
                <div className="mt-8 border-t border-border pt-6">
                  <h3 className="eyebrow mb-3">Related memory</h3>
                  <div className="space-y-3">
                    {relatedMemories.map((m) => (
                      <div key={m.id} className="border-l border-primary/60 pl-3.5 py-1">
                        <p className="text-[14px] font-medium text-foreground break-words">
                          {m.title}
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed break-words">
                          {m.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {task.sourceId && (
                <div className="mt-8 border-t border-border pt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="eyebrow">Source</h3>
                    <span className="rounded bg-surface-hover px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground border border-border">
                      {sourceType}
                    </span>
                  </div>
                  {sourcePreview && (
                    <div className="mt-3">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                        Source preview
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground line-clamp-3 break-words">
                        {sourcePreview}
                      </p>
                    </div>
                  )}
                  {exactEvidence && (
                    <div className="mt-3">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                        Exact evidence
                      </p>
                      <blockquote className="mt-1 border-l-2 border-primary/60 pl-3 text-[13px] italic text-foreground leading-relaxed break-words">
                        &ldquo;{exactEvidence}&rdquo;
                      </blockquote>
                    </div>
                  )}
                  {task.source?.captured && (
                    <p className="mt-2.5 text-[12px] text-faint break-words">
                      {task.source.captured}
                    </p>
                  )}
                </div>
              )}
              <h3 className="eyebrow mt-10">Reminders</h3>
              {!task.reminders ||
              task.reminders.length === 0 ||
              task.when === "No deadline" ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No reminder until a deadline is set.
                </p>
              ) : (
                <div className="mt-2">
                  {task.reminders.map((reminder, index) => (
                    <label
                      key={`${reminder.label}-${index}`}
                      className="flex cursor-pointer items-center justify-between border-b border-border py-3"
                    >
                      <div className="flex flex-col">
                        <span
                          className={`text-sm ${
                            reminder.enabled ? "" : "text-faint line-through"
                          }`}
                        >
                          {reminder.label}
                        </span>
                        <span className="text-[11px] text-faint">
                          {reminder.kind === "follow_up"
                            ? "Follow-up if unfinished"
                            : "Primary reminder"}
                        </span>
                      </div>
                      <Switch
                        checked={reminder.enabled}
                        onChange={() => toggleReminder(task.id, index)}
                      />
                    </label>
                  ))}
                </div>
              )}
              <button
                onClick={() => toggleDone(task.id)}
                className="mt-10 flex w-full items-center justify-center gap-2 border border-foreground py-2.5 text-sm font-medium transition-colors hover:bg-foreground hover:text-background"
              >
                {task.done && <Check className="h-4 w-4" />}
                {task.done ? "Mark as not done" : "Mark as done"}
              </button>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit task details
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-[13px] font-medium text-faint hover:text-primary transition-colors"
                >
                  Delete task
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-[360px] border border-border bg-surface p-6 shadow-2xl space-y-4">
            <h4 className="text-[16px] font-semibold text-foreground">Delete task?</h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              &ldquo;{task.title}&rdquo; will be deleted permanently. All pending reminders for this task will be cancelled.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-border px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteTask}
                className="bg-primary px-3.5 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isDeleting ? "Deleting..." : "Delete task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MemoryRow({ memory, onForget }: { memory: Memory; onForget?: () => void }) {
  const { tasks, open, updateMemory, deleteMemory } = useUnbury();
  const [paused, setPaused] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [fetchedSource, setFetchedSource] = useState<{
    preview?: string;
    type?: "Text" | "Image" | "PDF" | "Audio";
  } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(memory.title);
  const [editDetail, setEditDetail] = useState(memory.detail);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const linkedTask = memory.taskId ? tasks.find((t) => t.id === memory.taskId) : null;
  const taskTitle = memory.taskTitle || linkedTask?.title;

  useEffect(() => {
    if (showSource && memory.sourceId && (!memory.sourcePreview || !memory.sourceType)) {
      fetchSourceInfo(memory.sourceId).then((res) => {
        if (res) setFetchedSource(res);
      });
    }
  }, [showSource, memory.sourceId, memory.sourcePreview, memory.sourceType]);

  const sourceType =
    memory.sourceType || fetchedSource?.type || (memory.source as any) || "Text";
  const sourcePreview = memory.sourcePreview || fetchedSource?.preview;

  const handleSave = async () => {
    if (!editTitle.trim() || !editDetail.trim()) return;
    setIsSaving(true);
    try {
      const ok = await updateMemory(memory.id, {
        title: editTitle.trim(),
        content: editDetail.trim(),
      });
      if (ok) {
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const ok = await deleteMemory(memory.id);
      if (!ok && onForget) {
        onForget();
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="group border-b border-border py-4 last:border-b-0">
      {isEditing ? (
        <div className="w-full space-y-3 py-1">
          <div>
            <label className="eyebrow text-faint mb-1 block">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-transparent text-[15px] font-semibold border-b border-border-strong focus:border-primary pb-1 outline-none text-foreground transition-colors"
              placeholder="Memory title"
            />
          </div>
          <div>
            <label className="eyebrow text-faint mb-1 block">Content</label>
            <textarea
              value={editDetail}
              onChange={(e) => setEditDetail(e.target.value)}
              rows={2}
              className="w-full bg-transparent text-sm border border-border p-2 outline-none focus:border-primary text-foreground resize-none leading-relaxed"
              placeholder="Content or detail..."
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isSaving || !editTitle.trim() || !editDetail.trim()}
              onClick={handleSave}
              className="bg-primary px-3.5 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setIsEditing(false);
                setEditTitle(memory.title);
                setEditDetail(memory.detail);
              }}
              className="border border-border px-3 py-1 text-[12px] font-medium text-muted-foreground hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-6">
            <div className={`min-w-0 ${paused ? "opacity-50" : ""}`}>
              <p className="text-[15px] font-medium break-words">{memory.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground break-words">{memory.detail}</p>
              {memory.evidence && (
                <p className="mt-1.5 text-[13px] italic text-muted-foreground/85 border-l border-border-strong pl-2.5 break-words">
                  &ldquo;{memory.evidence}&rdquo;
                </p>
              )}
              {memory.taskId && (
                <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <span className="text-faint">Related task:</span>
                  <button
                    type="button"
                    onClick={() => open(memory.taskId!)}
                    className="font-medium text-foreground underline decoration-border-strong underline-offset-2 transition-colors hover:text-primary hover:decoration-primary text-left break-words"
                  >
                    {taskTitle || "View task"}
                  </button>
                </div>
              )}
              <p className="mt-1.5 text-[12px] text-faint">
                {memory.meta} · from {memory.source}
                {paused ? " · paused" : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-3 text-[12px] font-medium text-faint opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
              {memory.sourceId ? (
                <button
                  onClick={() => setShowSource((current) => !current)}
                  className="hover:text-foreground"
                >
                  {showSource ? "Hide source" : "Source"}
                </button>
              ) : null}
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditTitle(memory.title);
                  setEditDetail(memory.detail);
                }}
                className="hover:text-foreground"
              >
                Edit
              </button>
              <button
                onClick={() => setPaused((current) => !current)}
                className="hover:text-foreground"
              >
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="hover:text-primary"
              >
                Delete
              </button>
            </div>
          </div>
          {showDeleteConfirm && (
            <div className="mt-3 flex items-center justify-between border border-border bg-surface-hover/60 p-3 text-[13px]">
              <span className="text-foreground">Delete this memory permanently?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="bg-primary px-3 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="border border-border px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {showSource && (
            <div className="mt-3 border-l border-border-strong pl-3 space-y-1.5 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  Source · {sourceType}
                </span>
              </div>
              {sourcePreview && (
                <p className="text-[12px] text-muted-foreground leading-relaxed break-words line-clamp-3">
                  {sourcePreview}
                </p>
              )}
              {memory.evidence && (
                <blockquote className="border-l border-primary/50 pl-2 text-[12px] italic text-foreground leading-relaxed break-words">
                  &ldquo;{memory.evidence}&rdquo;
                </blockquote>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
