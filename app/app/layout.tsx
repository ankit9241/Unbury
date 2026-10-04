import AppShell from "@/components/app-shell";
import { getDashboardTasks } from "@/lib/db/tasks";
import { getGroupedMemories } from "@/lib/db/memories";
import { getDashboardDumps } from "@/lib/db/sources";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [initialTasks, initialMemories, initialDumps] = await Promise.all([
    getDashboardTasks(),
    getGroupedMemories(),
    getDashboardDumps(),
  ]);

  return (
    <AppShell
      initialTasks={initialTasks}
      initialMemories={initialMemories}
      initialDumps={initialDumps}
    >
      {children}
    </AppShell>
  );
}
