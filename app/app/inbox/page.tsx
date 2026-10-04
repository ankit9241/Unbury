"use client";

import { EmptyState, DumpComposer, PageHeader, Section, Thinking } from "@/components/ui";
import { useUnbury } from "@/lib/store";

export default function InboxPage() {
  const { dumps, confirmDump } = useUnbury();
  return <><PageHeader title="Inbox" sub="Drop anything here. Unbury will figure out what matters." /><div className="mb-14"><DumpComposer showModes /></div><Section label="Recent dumps">{dumps.length === 0 && <EmptyState title="Your inbox is clear." body="Drop something whenever your brain gets noisy." />}{dumps.map((dump) => <div key={dump.id} className="grid grid-cols-[88px_1fr_auto] items-start gap-4 border-b border-border py-4 last:border-b-0"><span className="pt-0.5 text-[12px] font-medium text-faint">{dump.kind}</span><div className="min-w-0"><p className="truncate text-[15px]">&quot;{dump.preview}&quot;</p><div className="mt-1 text-[13px]">{dump.state === "processing" ? <Thinking label="Understanding this" /> : <span className="text-muted-foreground">{dump.result}</span>}</div></div><div className="text-right"><p className="text-[12px] text-faint">{dump.time}</p>{dump.state === "review" && <button onClick={() => confirmDump(dump.id)} className="mt-1 text-[13px] font-medium text-primary hover:text-primary-deep">Review &amp; confirm</button>}{dump.state === "processed" && <p className="mt-1 text-[13px] font-medium">Processed</p>}</div></div>)}</Section></>;
}
