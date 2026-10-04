"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, Inbox, Search, Settings } from "lucide-react";
import { Logo, TaskDrawer } from "./ui";
import ReminderWatcher from "./reminder-watcher";
import { UnburyProvider } from "@/lib/store";
import type { Dump, Task } from "@/lib/data";
import type { GroupedMemories } from "@/lib/db/memories";

const nav = [
  { href: "/app", label: "Today" },
  { href: "/app/upcoming", label: "Upcoming" },
  { href: "/app/memory", label: "Memory", icon: Brain },
  { href: "/app/ask", label: "Ask Unbury", icon: Search },
  { href: "/app/inbox", label: "Inbox", icon: Inbox },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export default function AppShell({
  children,
  initialTasks = [],
  initialMemories,
  initialDumps = [],
}: {
  children: React.ReactNode;
  initialTasks?: Task[];
  initialMemories?: GroupedMemories;
  initialDumps?: Dump[];
}) {
  const pathname = usePathname();

  return (
    <UnburyProvider
      initialTasks={initialTasks}
      initialMemories={initialMemories}
      initialDumps={initialDumps}
    >
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 hidden w-[224px] flex-col border-r border-border px-5 py-7 md:flex">
          <Link href="/" className="mb-10 px-2"><Logo /></Link>
          <nav className="flex flex-col gap-0.5">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === "/app" ? pathname === href : pathname.startsWith(href);
              return <Link key={href} href={href} className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors ${active ? "bg-primary-soft text-primary-deep" : "text-muted-foreground hover:text-foreground"}`}>{Icon && <Icon className="h-4 w-4" strokeWidth={1.7} />}{label}</Link>;
            })}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 border-t border-border px-2 pt-5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[12px] font-semibold">AK</span>
            <div className="leading-tight"><p className="text-[13px] font-medium">Ankit Kumar</p><p className="text-[12px] text-faint">Personal</p></div>
          </div>
        </aside>
        <header className="flex items-center justify-between border-b border-border px-5 py-4 md:hidden"><Logo /><span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[12px] font-semibold">AK</span></header>
        <main className="px-5 pb-28 pt-10 md:ml-[224px] md:px-12 md:pb-20 md:pt-16"><div className="mx-auto max-w-[1000px]">{children}</div></main>
        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-background/95 px-2 py-2.5 backdrop-blur md:hidden">
          {nav.map(({ href, label }) => { const active = href === "/app" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={`px-2 py-1 text-[13px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>{label}</Link>; })}
        </nav>
        <TaskDrawer />
        <ReminderWatcher />
      </div>
    </UnburyProvider>
  );
}
