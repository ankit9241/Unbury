"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader, Section, Switch } from "@/components/ui";

function NotificationPermissionControl() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window !== "undefined") {
      if ("Notification" in window) {
        setPermission(Notification.permission);
      } else {
        setPermission("unsupported");
      }
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const res = await Notification.requestPermission();
        setPermission(res);
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (permission === "granted") {
    return <span className="text-sm font-medium text-primary">Notifications enabled</span>;
  }

  if (permission === "denied") {
    return <span className="text-sm font-medium text-muted-foreground">Notifications blocked</span>;
  }

  return (
    <button
      type="button"
      onClick={requestPermission}
      className="rounded border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
    >
      Enable notifications
    </button>
  );
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-6 border-b border-border py-4 last:border-b-0"><div><p className="text-[15px] font-medium">{title}</p>{sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}</div>{children}</div>;
}

const linkClass = "text-sm font-medium text-muted-foreground hover:text-primary";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Section label="Notifications">
        <Row title="Browser notifications" sub="Deliver nudges when reminders become due">
          <NotificationPermissionControl />
        </Row>
        <Row title="Reminders" sub="Nudges before things are due">
          <Switch defaultChecked />
        </Row>
        <Row title="Deadline warnings" sub="When something is close and not started">
          <Switch defaultChecked />
        </Row>
        <Row title="Follow-ups" sub="When someone is waiting on you">
          <Switch />
        </Row>
      </Section>
      <Section label="Memory">
        <Row title="Remember extracted information" sub="People, deadlines and context from your dumps">
          <Switch defaultChecked />
        </Row>
        <Row title="Review remembered information">
          <Link href="/app/memory" className={linkClass}>
            Open →
          </Link>
        </Row>
        <Row title="Clear selected memory" sub="Choose what Unbury should forget">
          <button className={linkClass}>Choose…</button>
        </Row>
      </Section>
      <Section label="Appearance">
        <Row title="Theme">
          <span className="text-sm text-muted-foreground">Light</span>
        </Row>
      </Section>
      <Section label="Account">
        <Row title="Ankit Kumar" sub="ankit@example.com">
          <button className={linkClass}>Sign out</button>
        </Row>
      </Section>
    </>
  );
}
