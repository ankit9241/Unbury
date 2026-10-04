import Link from "next/link";
import { Logo } from "@/components/ui";

const steps = [
  ["01", "Dump", "Paste a message, drop a screenshot, upload a PDF. No sorting."],
  ["02", "Understand", "Unbury finds the tasks, deadlines and people inside."],
  ["03", "Remember", "It keeps them with the source, so you know why."],
  ["04", "Remind", "A quiet nudge before something becomes a problem."],
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10"><Logo /><Link href="/app" className="text-sm font-medium text-muted-foreground hover:text-foreground">Open app</Link></header>
      <main className="mx-auto max-w-6xl px-6 md:px-10">
        <section className="relative pb-24 pt-20 md:pb-32 md:pt-32">
          <svg className="pointer-events-none absolute right-0 top-24 hidden text-border-strong lg:block" width="320" height="220" viewBox="0 0 320 220" aria-hidden="true"><path d="M10 200C90 200 80 40 170 60S260 170 310 20" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 5" /><circle cx="10" cy="200" r="3" fill="currentColor" opacity=".35" /><circle cx="170" cy="60" r="3" fill="currentColor" opacity=".35" /><circle cx="310" cy="20" r="4" fill="var(--primary)" /></svg>
          <p className="eyebrow mb-6">Your external memory</p>
          <h1 className="max-w-3xl text-[46px] font-semibold leading-[1.02] tracking-[-0.045em] md:text-[76px]">Give it your messy life.<br /><span className="text-muted-foreground">It remembers what matters.</span></h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">Unbury turns scattered messages, screenshots, deadlines and notes into things you actually need to remember, then reminds you before they become problems.</p>
          <div className="mt-10 flex flex-wrap items-center gap-6"><Link href="/app" className="border border-primary bg-primary px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-primary-deep">Start unburying</Link><a href="#how" className="text-[15px] font-medium underline decoration-border-strong underline-offset-4 hover:decoration-primary">See how it works</a></div>
        </section>
        <section id="how" className="border-t border-border py-20 md:py-28"><div className="grid gap-12 md:grid-cols-4 md:gap-0">{steps.map(([number, title, description], index) => <div key={title} className="relative md:pr-8"><div className="mb-6 flex items-center"><span className={`h-2 w-2 rounded-full ${index === 3 ? "bg-primary" : "bg-border-strong"}`} />{index < 3 && <span className="ml-3 hidden h-px flex-1 bg-border md:block" />}</div><p className="text-[12px] font-medium text-faint">{number}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-3 max-w-[15rem] text-[15px] leading-relaxed text-muted-foreground">{description}</p></div>)}</div></section>
        <section className="grid gap-10 border-t border-border py-20 md:grid-cols-[1fr_1.2fr] md:py-28"><h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em]">Every reminder<br />shows its receipt.</h2><div><p className="text-lg font-medium">Submit DBMS Assignment 3</p><p className="mt-1 text-sm text-muted-foreground">Due Sunday · 11:59 PM</p><blockquote className="mt-6 border-l border-border-strong pl-4 text-[15px] leading-relaxed">&quot;Assignment 3 has been uploaded. Please submit it by Sunday night.&quot;</blockquote><p className="mt-2 pl-4 text-[13px] text-muted-foreground">Captured from screenshot · Oct 2</p></div></section>
      </main>
      <footer className="mx-auto flex max-w-6xl justify-between border-t border-border px-6 py-8 text-[13px] text-faint md:px-10"><span>© 2026 Unbury</span><span>Dump → Understand → Remember → Remind</span></footer>
    </div>
  );
}
