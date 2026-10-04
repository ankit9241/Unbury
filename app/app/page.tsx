"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DumpComposer, EmptyState, Section, SourceMark, TaskRow } from "@/components/ui";
import { useUnbury } from "@/lib/store";
import { groupTasksByDeadline } from "@/lib/date";

export default function TodayPage() {
  const { tasks, memories } = useUnbury();
  const [dateLabels, setDateLabels] = useState({
    header: "Today",
    todayAside: "Today",
    tomorrowAside: "Tomorrow",
  });

  useEffect(() => {
    const now = new Date();
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(now.getDate() + 1);

    const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
    const monthDay = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const todayAside = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const tomorrowAside = tomorrowDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    setDateLabels({
      header: `${weekday} · ${monthDay}`,
      todayAside,
      tomorrowAside,
    });
  }, []);

  const taskGroups = groupTasksByDeadline(tasks);
  const open = tasks.filter((task) => !task.done).length;
  const upcomingGroup = taskGroups.find((g) => g.key === "upcoming");
  const nextUp = (upcomingGroup?.tasks || []).slice(0, 3);

  const allMemories = [
    ...memories.People.map((m) => ({ who: m.title, what: m.detail, src: m.meta })),
    ...memories.Deadlines.map((m) => ({ who: m.title, what: m.detail, src: m.meta })),
    ...memories.Context.map((m) => ({ who: m.title, what: m.detail, src: m.meta })),
  ];
  const recentItems = allMemories.slice(0, 3);

  return (
    <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-16">
      <div className="min-w-0">
        <header className="mb-12">
          <p className="eyebrow mb-5">{dateLabels.header}</p>
          <h1 className="text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] md:text-[50px]">
            {open === 0
              ? "Nothing urgent."
              : `${open} ${open === 1 ? "thing needs" : "things need"} your attention.`}
          </h1>
          <p className="mt-4 text-[16px] text-muted-foreground">
            {open === 0
              ? "Your important things are under control."
              : "Nothing is slipping through the cracks."}
          </p>
        </header>
        <div className="mb-16">
          <DumpComposer />
        </div>
        {taskGroups.some((g) => g.tasks.length > 0) ? (
          taskGroups.map((group) => {
            if (group.tasks.length === 0) return null;
            const aside =
              group.key === "today" ? (
                <span className="eyebrow">{dateLabels.todayAside}</span>
              ) : group.key === "tomorrow" ? (
                <span className="eyebrow">{dateLabels.tomorrowAside}</span>
              ) : undefined;

            return (
              <Section key={group.key} label={group.label} aside={aside}>
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </Section>
            );
          })
        ) : (
          <Section label="Today" aside={<span className="eyebrow">{dateLabels.todayAside}</span>}>
            <EmptyState
              title="Nothing urgent."
              body="Your important things are under control."
            />
          </Section>
        )}
        {recentItems.length > 0 && (
          <Section
            label="Recently remembered"
            aside={
              <Link
                href="/app/memory"
                className="text-[12px] font-medium text-muted-foreground hover:text-primary"
              >
                Memory →
              </Link>
            }
          >
            {recentItems.map((item, index) => (
              <div
                key={index}
                className="grid gap-1 border-b border-border py-4 last:border-b-0 sm:grid-cols-[140px_1fr_auto] sm:items-baseline sm:gap-6"
              >
                <p className="text-[15px] font-semibold">{item.who}</p>
                <p className="text-[15px] text-muted-foreground">{item.what}</p>
                <SourceMark label={item.src} />
              </div>
            ))}
          </Section>
        )}
      </div>
      <aside className="lg:pt-[132px]">
        <div className="lg:sticky lg:top-16">
          <p className="eyebrow mb-6">Up next</p>
          <ol className="relative space-y-7 border-l border-border pl-5">
            {nextUp.map((task) => (
              <li key={task.id} className="relative">
                <span className="absolute -left-[23.5px] top-[6px] h-[6px] w-[6px] rounded-full bg-border-strong" />
                <p className="text-[13px] text-faint">{task.when.split("·")[0]?.trim()}</p>
                <p className="mt-0.5 text-[15px] leading-snug">{task.title}</p>
              </li>
            ))}
          </ol>
          <Link
            href="/app/upcoming"
            className="mt-8 inline-block text-[13px] font-medium text-muted-foreground hover:text-primary"
          >
            See everything →
          </Link>
        </div>
      </aside>
    </div>
  );
}
