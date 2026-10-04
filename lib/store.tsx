"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Dump, Task } from "./data";
import type { GroupedMemories, MappedMemory } from "./db/memories";

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
        setMemories((current) => ({
          ...current,
          [category]: current[category].filter((item) => item.id !== id),
        }));
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
