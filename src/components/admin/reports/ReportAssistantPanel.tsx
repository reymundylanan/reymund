"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, BarChart3, Building2, CalendarCheck, Loader2, Send, Sparkles, UserRound, Users, X } from "lucide-react";
import { Answer } from "@/components/admin/reviews/ReviewAssistantPanel";
import GlowMascot from "@/components/GlowMascot";
import { REPORT_CATALOG, type ReportFilters, type ReportType } from "@/lib/reports/model";
import type { ChatTurn } from "@/lib/reviewAssistant";

type Message = ChatTurn & { reports?: ReportType[]; error?: boolean };

const QUICK: { title: string; icon: typeof Sparkles; questions: string[] }[] = [
  {
    title: "Services",
    icon: Sparkles,
    questions: ["Which service has the most clients?", "Which service earned the most?", "Which services are rarely booked?"],
  },
  { title: "Sales", icon: BarChart3, questions: ["How much did we earn in this period?", "What's our busiest day?", "Cash vs GCash — which is used more?"] },
  { title: "Staff", icon: UserRound, questions: ["Who completed the most services?", "Which staff member has the best rating?"] },
  { title: "Clients", icon: Users, questions: ["Who are our top spending clients?", "How many new vs returning clients?"] },
  { title: "Branches", icon: Building2, questions: ["Compare our branches.", "Which branch has more walk-ins?"] },
  { title: "Bookings", icon: CalendarCheck, questions: ["How many cancellations and no-shows?", "What time of day is busiest?"] },
];

const TITLE = Object.fromEntries(REPORT_CATALOG.map((r) => [r.type, r.title])) as Record<ReportType, string>;

function niceDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Admin → Reports: ask questions about the report numbers for the current
 * date range and branch / staff filters. */
export default function ReportAssistantPanel({
  filters,
  scopeLabel,
  onClose,
  onOpenReport,
}: {
  filters: ReportFilters;
  scopeLabel: string;
  onClose: () => void;
  onOpenReport: (type: ReportType) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: ChatTurn[] = [...messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), { role: "user", content: q }];
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reports/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          filters: { from: filters.from, to: filters.to, branchId: filters.branchId, staffId: filters.staffId },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.answer) {
        setMessages((prev) => [...prev, { role: "assistant", content: data?.error ?? "The assistant couldn't answer right now. Please try again.", error: true }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.answer, reports: data.reports ?? [] }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error — please check your connection and try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-label="AI Report Assistant" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-ink/10 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 bg-gradient-to-r from-cream to-[#fbf1dc] p-5">
          <div className="flex gap-3">
            <span className="shrink-0 rounded-full bg-white p-0.5 shadow-sm">
              <GlowMascot size={40} talking={busy} />
            </span>
            <div>
              <h2 className="font-semibold text-ink">AI Report Assistant</h2>
              <p className="text-xs text-ink/55">Ask about bookings, sales, services, staff, clients and branches.</p>
              <p className="mt-1 inline-block rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-coral-dark">
                {niceDate(filters.from)} – {niceDate(filters.to)} · {scopeLabel}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close assistant" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl bg-blush/60 p-3 text-sm text-ink/80">
            Hi! I read the same numbers as your reports for the dates and filters above. Ask me anything, or pick a question.
          </div>

          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink">Quick Questions</p>
              {QUICK.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.title} className="rounded-xl border border-ink/10 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink/70">
                      <Icon className="h-3.5 w-3.5 text-coral-dark" /> {group.title}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {group.questions.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => ask(q)}
                          className="block w-full rounded-lg border border-ink/10 px-3 py-1.5 text-left text-xs text-ink/70 hover:border-coral hover:bg-blush/40"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-coral px-3 py-2 text-sm text-white">
                {m.content}
              </div>
            ) : (
              <div key={i} className={`mr-4 rounded-2xl rounded-bl-sm border p-3 text-sm ${m.error ? "border-red-200 bg-red-50 text-red-700" : "border-ink/10 bg-white text-ink/80"}`}>
                {m.error ? <p>{m.content}</p> : <Answer text={m.content} />}
                {m.reports && m.reports.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.reports.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onOpenReport(t)}
                        className="inline-flex items-center gap-1 rounded-full border border-coral/40 px-3 py-1 text-xs font-semibold text-coral-dark hover:bg-blush"
                      >
                        Open {TITLE[t]} <ArrowRight className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {busy && (
            <p className="flex items-center gap-2 text-xs text-ink/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Crunching your numbers…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="border-t border-ink/10 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <div className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 focus-within:border-coral">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 500))}
              placeholder="e.g. Which service has the most clients?"
              aria-label="Ask about your reports"
              className="w-full text-sm outline-none placeholder:text-ink/40"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral text-white hover:bg-coral-dark disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink/40">Uses your real data for the selected dates and filters. Read-only — it can&apos;t change anything.</p>
        </form>
      </aside>
    </>
  );
}
