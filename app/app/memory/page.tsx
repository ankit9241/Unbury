"use client";

import { useEffect } from "react";
import { EmptyState, MemoryRow, PageHeader, Section } from "@/components/ui";
import { useUnbury } from "@/lib/store";

const categories: Array<"People" | "Deadlines" | "Context"> = [
  "People",
  "Deadlines",
  "Context",
];

export default function MemoryPage() {
  const { tasks, memories, addMemories, forgetMemory, open } = useUnbury();

  useEffect(() => {
    fetch("/api/memory")
      .then((res) => res.json())
      .then((data) => {
        if (data.memories && Array.isArray(data.memories)) {
          addMemories(data.memories);
        }
      })
      .catch(() => {});
  }, [addMemories]);

  const remembered = tasks.filter((task) => !task.done && task.priority === "High");
  const total = Object.values(memories).flat().length;

  return (
    <>
      <PageHeader
        title="What Unbury remembers"
        sub="People, deadlines, tasks and context you've asked Unbury to keep track of."
      />
      {remembered.length > 0 && (
        <Section label="Tasks">
          {remembered.map((task) => (
            <button
              key={task.id}
              onClick={() => open(task.id)}
              className="block w-full border-b border-border py-4 text-left last:border-b-0 hover:text-primary transition-colors"
            >
              <p className="text-[15px] font-medium">{task.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{task.when}</p>
              <p className="mt-1 text-[12px] text-faint">{task.source.captured}</p>
            </button>
          ))}
        </Section>
      )}
      {total === 0 && remembered.length === 0 ? (
        <EmptyState
          title="Nothing remembered yet."
          body="Start by dumping something Unbury should remember."
        />
      ) : (
        categories.map((key) =>
          memories[key].length > 0 ? (
            <Section key={key} label={key}>
              {memories[key].map((item) => (
                <MemoryRow
                  key={item.id}
                  memory={item}
                  onForget={() => forgetMemory(key, item.id)}
                />
              ))}
            </Section>
          ) : null
        )
      )}
    </>
  );
}
