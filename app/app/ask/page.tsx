"use client";

import { useState } from "react";
import { PageHeader, Thinking } from "@/components/ui";
import { useUnbury } from "@/lib/store";
import type { RetrievedEvidence } from "@/lib/ai/ask";

export default function AskPage() {
  const { open } = useUnbury();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<{
    question: string;
    answer: string;
    evidence: RetrievedEvidence[];
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to query memory.");
      }

      setResponse({
        question: trimmed,
        answer: data.answer,
        evidence: data.evidence || [],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="Ask Unbury"
        sub="Search your external memory for answers grounded in what you confirmed."
      />

      <form onSubmit={handleSubmit} className="mb-12">
        <div className="flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about tasks, people, or deadlines..."
            className="flex-1 rounded-md border border-border bg-surface px-4 py-2.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            maxLength={500}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="border border-primary bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-deep disabled:opacity-50 disabled:pointer-events-none"
          >
            Ask
          </button>
        </div>
      </form>

      {loading && (
        <div className="py-8">
          <Thinking label="Searching memory" />
        </div>
      )}

      {error && (
        <div className="py-4 text-sm text-primary-deep">
          {error}
        </div>
      )}

      {response && !loading && (
        <div className="border-t border-border pt-8">
          <p className="eyebrow mb-3">&ldquo;{response.question}&rdquo;</p>
          <p className="text-[17px] font-medium leading-relaxed text-foreground">
            {response.answer}
          </p>

          {response.evidence.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <p className="eyebrow mb-4">From your memory</p>
              <div className="space-y-4">
                {response.evidence.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => item.type === "task" && open(item.id)}
                    className={`border-l-2 border-primary/60 pl-4 py-1 ${
                      item.type === "task" ? "cursor-pointer hover:bg-muted/30" : ""
                    }`}
                  >
                    <span className="eyebrow text-[11px] text-faint">
                      {item.type}
                    </span>
                    <blockquote className="mt-1 text-[14px] italic text-muted-foreground leading-relaxed">
                      &ldquo;{item.text}&rdquo;
                    </blockquote>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
