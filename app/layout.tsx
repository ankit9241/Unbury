import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Unbury — Your external memory",
    template: "%s — Unbury",
  },
  description: "Give Unbury your messy life. It remembers what matters and reminds you before it becomes a problem.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
