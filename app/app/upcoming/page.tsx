"use client";

import { EmptyState, PageHeader, Section, TaskRow } from "@/components/ui";
import { useUnbury } from "@/lib/store";
import { groupTasksByDeadline } from "@/lib/date";

export default function UpcomingPage() {
  const { tasks } = useUnbury();
  const taskGroups = groupTasksByDeadline(tasks);
  const comingUpGroups = taskGroups.filter((g) => g.key === "tomorrow" || g.key === "upcoming");
  const hasComingUp = comingUpGroups.some((g) => g.tasks.length > 0);

  return (
    <>
      <PageHeader
        title="Coming up"
        sub="Everything Unbury thinks you shouldn't forget."
      />
      {!hasComingUp ? (
        <EmptyState
          title="Nothing coming up."
          body="You have no upcoming tasks or deadlines scheduled."
        />
      ) : (
        comingUpGroups.map((group) => {
          if (group.tasks.length === 0) return null;
          return (
            <Section key={group.key} label={group.label}>
              {group.tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </Section>
          );
        })
      )}
    </>
  );
}
