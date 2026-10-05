"use client";

import { useEffect, useRef, useState } from "react";

interface ActiveReminderAlert {
  _id: string;
  taskTitle: string;
  taskDeadline: string | null;
  reminderOffset?: string;
  kind?: string;
}

export default function ReminderWatcher() {
  const inFlightRef = useRef(false);
  const [alerts, setAlerts] = useState<ActiveReminderAlert[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPermission("Notification" in window ? Notification.permission : "unsupported");
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const res = await Notification.requestPermission();
        setPermission(res);
        console.log("[reminder-watcher] user requested permission, result:", res);
      } catch (err) {
        console.error("[reminder-watcher] requestPermission error:", err);
      }
    }
  };

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a._id !== id));
  };

  useEffect(() => {
    async function checkReminders() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const hasNotificationApi = typeof window !== "undefined" && "Notification" in window;
      const currentPermission = hasNotificationApi ? Notification.permission : "unsupported";

      try {
        const res = await fetch("/api/reminders", { cache: "no-store" });
        if (!res.ok) {
          console.warn("[reminder-watcher] fetch /api/reminders failed with status:", res.status);
          return;
        }
        const data = await res.json();
        const dueReminders: Array<{
          _id: string;
          taskTitle: string;
          taskDeadline: string | null;
          reminderOffset?: string;
          scheduledFor: string;
          status: string;
          kind?: string;
        }> = data.reminders || [];

        // Structured diagnostic log as requested
        console.log("[reminder-watcher] poll:", {
          clientTime: new Date().toISOString(),
          localTime: new Date().toLocaleTimeString(),
          watcherRunning: true,
          notificationPermission: currentPermission,
          dueCount: dueReminders.length,
          dueReminders: dueReminders.map((r) => ({
            id: r._id,
            title: r.taskTitle,
            scheduledFor: r.scheduledFor,
            status: r.status,
          })),
        });

        if (dueReminders.length === 0) return;

        for (const reminder of dueReminders) {
          const body = reminder.taskDeadline
            ? `${reminder.taskTitle}\nDue: ${reminder.taskDeadline}`
            : reminder.taskTitle;

          let notificationInvoked = false;

          // 1. Invoke OS / Browser notification if permission granted
          if (hasNotificationApi && Notification.permission === "granted") {
            try {
              new Notification("Unbury reminder", {
                body,
              });
              notificationInvoked = true;
            } catch (notifErr) {
              console.error("[reminder-watcher] Notification() invocation failed:", notifErr);
            }
          }

          console.log("[reminder-watcher] reminder processed:", {
            id: reminder._id,
            title: reminder.taskTitle,
            scheduledFor: reminder.scheduledFor,
            status: reminder.status,
            notificationInvoked,
            notificationPermission: currentPermission,
          });

          // 2. Trigger in-app visual reminder alert while app is open
          setAlerts((prev) => {
            if (prev.some((a) => a._id === reminder._id)) return prev;
            return [...prev, reminder];
          });

          // 3. Mark reminder as sent in DB
          try {
            await fetch("/api/reminders", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reminderId: reminder._id }),
            });
          } catch (patchErr) {
            console.error("[reminder-watcher] failed to mark reminder as sent:", patchErr);
          }
        }
      } catch (err) {
        console.error("[reminder-watcher] poll error:", err);
      } finally {
        inFlightRef.current = false;
      }
    }

    // Check after initial 2 seconds, then poll every 15 seconds
    const initialTimeout = setTimeout(checkReminders, 2000);
    const interval = setInterval(checkReminders, 15000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2.5rem)] pointer-events-auto"
      role="region"
      aria-label="Reminders"
    >
      {alerts.map((alert) => (
        <div
          key={alert._id}
          className="bg-card border border-primary/30 shadow-xl rounded-xl p-4 flex items-start gap-3.5 backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-base">
            🔔
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                {alert.reminderOffset || "Reminder"}
              </span>
              <button
                type="button"
                onClick={() => dismissAlert(alert._id)}
                className="text-muted-foreground hover:text-foreground text-xs p-0.5 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
            <p className="text-[14px] font-semibold text-foreground mt-0.5 leading-snug">
              {alert.taskTitle}
            </p>
            {alert.taskDeadline && (
              <p className="text-[12px] text-muted-foreground mt-1">
                Due: {alert.taskDeadline}
              </p>
            )}
            {permission === "default" && (
              <button
                type="button"
                onClick={requestPermission}
                className="mt-2.5 inline-block text-[11px] font-medium text-primary hover:underline underline-offset-2"
              >
                Enable browser alerts →
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
