"use client";

import { useEffect, useRef } from "react";

export default function ReminderWatcher() {
  const inFlightRef = useRef(false);

  useEffect(() => {
    async function checkReminders() {
      if (typeof window === "undefined" || !("Notification" in window)) {
        return;
      }

      // If notification permission is not granted, do not notify and do not mark as sent
      if (Notification.permission !== "granted") {
        return;
      }

      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const res = await fetch("/api/reminders", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const dueReminders: Array<{
          _id: string;
          taskTitle: string;
          taskDeadline: string | null;
          reminderOffset?: string;
        }> = data.reminders || [];

        for (const reminder of dueReminders) {
          const body = reminder.taskDeadline
            ? `${reminder.taskTitle}\nDue: ${reminder.taskDeadline}`
            : reminder.taskTitle;

          try {
            new Notification("Unbury reminder", {
              body,
            });

            // Mark reminder as sent after successfully triggering notification
            await fetch("/api/reminders", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reminderId: reminder._id }),
            });
          } catch (notifErr) {
            console.error("Failed to trigger reminder notification:", notifErr);
          }
        }
      } catch (err) {
        // Silently catch fetch or network errors
      } finally {
        inFlightRef.current = false;
      }
    }

    // Check after an initial 5 seconds, then every 30 seconds
    const initialTimeout = setTimeout(checkReminders, 5000);
    const interval = setInterval(checkReminders, 30000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  return null;
}
