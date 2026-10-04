"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Dump, Task } from "./data";
import type { GroupedMemories, MappedMemory } from "./db/memories";
import { classifyDeadlineToBucket } from "./date";

interface Store {
  tasks: Task[];
  dumps: Dump[];
  memories: GroupedMemories;
  openId: string | null;
  open: (id: string | null) => void;
  toggleDone: (id: string) => void;
  toggleReminder: (id: string, index: number) => void;
  resolveConflict: (id: string, conflictId?: string) => void | Promise<void>;
  addDump: (kind: Dump["kind"], preview: string) => void;
  confirmDump: (id: string) => void;
  addTasks: (newTasks: Task[]) => void;
  addMemories: (newMemories: MappedMemory[]) => void;
  addDumpItem: (dump: Dump) => void;
  forgetMemory: (category: "People" | "Deadlines" | "Context", id: string) => void;
  updateTaskDetails: (
    id: string,
    updates: {
      title?: string;
      description?: string;
      deadline?: string | null;
      reminderOffset?: string | null;
    }
  ) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  updateMemory: (id: string, updates: { title: string; content: string }) => Promise<boolean>;
  deleteMemory: (id: string) => Promise<boolean>;
  refreshAll: () => Promise<void>;
}

const emptyMemories: GroupedMemories = {
  People: [],
  Deadlines: [],
  Context: [],
};

const StoreContext = createContext<Store | null>(null);

export function UnburyProvider({
  children,
  initialTasks = [],
  initialMemories = emptyMemories,
  initialDumps = [],
}: {
  children: ReactNode;
  initialTasks?: Task[];
  initialMemories?: GroupedMemories;
  initialDumps?: Dump[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [dumps, setDumps] = useState<Dump[]>(initialDumps);
  const [memories, setMemories] = useState<GroupedMemories>(initialMemories);
  const [openId, setOpenId] = useState<string | null>(null);

  const refreshAll = async () => {
    try {
      const [tasksRes, memoriesRes, dumpsRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/memories"),
        fetch("/api/inbox"),
      ]);

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        if (Array.isArray(data.tasks)) setTasks(data.tasks);
      }

      if (memoriesRes.ok) {
        const data = await memoriesRes.json();
        if (data.memories) setMemories(data.memories);
      }

      if (dumpsRes.ok) {
        const data = await dumpsRes.json();
        if (Array.isArray(data.dumps)) setDumps(data.dumps);
      }
    } catch {}
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const patchTask = (id: string, update: (task: Task) => Task) => {
    setTasks((current) => current.map((task) => (task.id === id ? update(task) : task)));
  };

  const value = useMemo<Store>(
    () => ({
      tasks,
      dumps,
      memories,
      open: setOpenId,
      openId,
      toggleDone: (id) =>
        patchTask(id, (task) => {
          const nextDone = !task.done;
          if (nextDone) {
            fetch("/api/tasks", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: id, status: "done" }),
            }).catch(() => {});
          }
          return {
            ...task,
            done: nextDone,
            status: nextDone ? "Done" : "Not started",
          };
        }),
      toggleReminder: (id, index) =>
        patchTask(id, (task) => ({
          ...task,
          reminders: task.reminders.map((reminder, reminderIndex) =>
            reminderIndex === index ? { ...reminder, enabled: !reminder.enabled } : reminder
          ),
        })),
      resolveConflict: async (id, conflictId) => {
        if (conflictId) {
          try {
            const res = await fetch("/api/conflicts", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conflictId, action: "accept_new" }),
            });
            if (res.ok) {
              await refreshAll();
              return;
            }
          } catch {}
        }
        patchTask(id, (task) =>
          task.conflict ? { ...task, conflict: { ...task.conflict, resolved: conflictId || "resolved" } } : task
        );
      },
      addTasks: (newTasks) => {
        setTasks((current) => {
          const existingIds = new Set(current.map((t) => t.id));
          const filtered = newTasks.filter((t) => !existingIds.has(t.id));
          return [...filtered, ...current];
        });
      },
      addMemories: (newMemories) => {
        setMemories((current) => {
          const updated: GroupedMemories = {
            People: [...current.People],
            Deadlines: [...current.Deadlines],
            Context: [...current.Context],
          };

          for (const mem of newMemories) {
            if (mem.type === "person") {
              if (!updated.People.some((p) => p.id === mem.id)) {
                updated.People.unshift(mem);
              }
            } else if (mem.type === "deadline") {
              if (!updated.Deadlines.some((d) => d.id === mem.id)) {
                updated.Deadlines.unshift(mem);
              }
            } else {
              if (!updated.Context.some((c) => c.id === mem.id)) {
                updated.Context.unshift(mem);
              }
            }
          }

          return updated;
        });
      },
      addDumpItem: (dump) => {
        setDumps((current) => {
          if (current.some((d) => d.id === dump.id)) return current;
          return [dump, ...current];
        });
      },
      forgetMemory: (category, id) => {
        fetch(`/api/memory?memoryId=${id}`, { method: "DELETE" }).catch(() => {});
        setMemories((current) => ({
          ...current,
          [category]: current[category].filter((item) => item.id !== id),
        }));
      },
      updateTaskDetails: async (id, updates) => {
        try {
          const res = await fetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: id, ...updates }),
          });
          if (res.ok) {
            patchTask(id, (task) => {
              const next: Task = { ...task };
              if (updates.title !== undefined) next.title = updates.title;
              if (updates.description !== undefined) {
                next.description = updates.description;
                if (!task.why || task.why === task.description) {
                  next.why = updates.description;
                }
              }
              if (updates.deadline !== undefined) {
                const { when, bucket } = classifyDeadlineToBucket(updates.deadline);
                next.deadline = updates.deadline;
                next.when = when;
                next.bucket = bucket;
              }
              return next;
            });
            await refreshAll();
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      deleteTask: async (id) => {
        try {
          const res = await fetch(`/api/tasks?taskId=${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setTasks((current) => current.filter((t) => t.id !== id));
            if (openId === id) setOpenId(null);
            // Also unlink in local memories
            setMemories((current) => {
              const unlink = (m: MappedMemory) =>
                m.taskId === id ? { ...m, taskId: null, taskTitle: null } : m;
              return {
                People: current.People.map(unlink),
                Deadlines: current.Deadlines.map(unlink),
                Context: current.Context.map(unlink),
              };
            });
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      updateMemory: async (id, updates) => {
        try {
          const res = await fetch("/api/memory", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memoryId: id, title: updates.title, content: updates.content }),
          });
          if (res.ok) {
            setMemories((current) => {
              const updateItem = (m: MappedMemory) =>
                m.id === id ? { ...m, title: updates.title, detail: updates.content } : m;
              return {
                People: current.People.map(updateItem),
                Deadlines: current.Deadlines.map(updateItem),
                Context: current.Context.map(updateItem),
              };
            });
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      deleteMemory: async (id) => {
        try {
          const res = await fetch(`/api/memory?memoryId=${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setMemories((current) => ({
              People: current.People.filter((m) => m.id !== id),
              Deadlines: current.Deadlines.filter((m) => m.id !== id),
              Context: current.Context.filter((m) => m.id !== id),
            }));
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      refreshAll,
      addDump: (kind, preview) => {
        const id = crypto.randomUUID();
        setDumps((current) => [{ id, kind, preview, time: "Just now", state: "processing" }, ...current]);
        window.setTimeout(() => {
          setDumps((current) =>
            current.map((dump) =>
              dump.id === id ? { ...dump, state: "review", result: "1 task found · 1 deadline" } : dump
            )
          );
        }, 2600);
      },
      confirmDump: (id) =>
        setDumps((current) =>
          current.map((dump) => (dump.id === id ? { ...dump, state: "processed" } : dump))
        ),
    }),
    [tasks, dumps, memories, openId]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useUnbury() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useUnbury must be used inside UnburyProvider");
  return context;
}
