"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Building2, Images, ListChecks, Loader2, Send, Sparkles, Star, UserRound, X } from "lucide-react";
import type { ChatTurn } from "@/lib/reviewAssistant";
import GlowMascot from "@/components/GlowMascot";

type Message = ChatTurn & { actions?: { label: string; href: string }[]; error?: boolean };

const QUICK: { title: string; icon: typeof Star; questions: string[] }[] = [
  {
    title: "Review Overview",
    icon: ListChecks,
    questions: ["How many reviews did we receive this month?", "Summarize our recent reviews.", "What do clients like most?", "What are the common complaints?"],
  },
  { title: "Staff", icon: UserRound, questions: ["Who has the most reviews?", "Which staff members received 5-star reviews?", "Show me reviews about Ms. Mary."] },
  {
    title: "Services",
    icon: Sparkles,
    questions: ["Which service has the most reviews?", "Which services receive the most positive feedback?", "Show me negative reviews about a service."],
  },
  { title: "Branches", icon: Building2, questions: ["Which branch has the most reviews?", "Compare reviews between branches.", "Show me feedback about One Cecilia Center."] },
  {
    title: "Review Details",
    icon: Images,
    questions: ["Show reviews with photos.", "Show recent 5-star reviews.", "Show recent low-rating reviews.", "Show reviews mentioning long waiting times."],
  },
];

/** **bold** inside a line, rendered as text (never HTML). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

/** Tiny formatter for the assistant's "### heading / - bullet / **bold**" answers. */
export function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="ml-4 list-disc space-y-0.5">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*•]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*•]\s+/, ""));
      continue;
    }
    flush();
    if (!line) continue;
    if (/^#{1,4}\s+/.test(line)) {
      blocks.push(
        <p key={`h${blocks.length}`} className="pt-1 text-sm font-semibold text-ink">
          {inline(line.replace(/^#{1,4}\s+/, ""))}
        </p>
      );
    } else {
      blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-1.5">{blocks}</div>;
}

export default function ReviewAssistantPanel({ onClose, onOpenFilters }: { onClose: () => void; onOpenFilters: (href: string) => void }) {
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
      const res = await fetch("/api/admin/reviews/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.answer) {
        setMessages((prev) => [...prev, { role: "assistant", content: data?.error ?? "The assistant couldn't answer right now. Please try again.", error: true }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.answer, actions: data.actions ?? [] }]);
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
      <aside
        role="dialog"
        aria-label="AI Review Assistant"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-ink/10 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 bg-gradient-to-r from-cream to-[#fbf1dc] p-5">
          <div className="flex gap-3">
            <span className="shrink-0 rounded-full bg-white p-0.5 shadow-sm">
              <GlowMascot size={40} talking={busy} />
            </span>
            <div>
              <h2 className="font-semibold text-ink">AI Review Assistant</h2>
              <p className="text-xs text-ink/50">Ask questions about your service, staff, branch, and client feedback.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close assistant" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl bg-blush/60 p-3 text-sm text-ink/80">
            Hello! I&apos;m your AI Review Assistant. Ask me anything about your reviews, or choose a quick question below.
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
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.actions.map((a) => (
                      <button
                        key={a.href + a.label}
                        type="button"
                        onClick={() => onOpenFilters(a.href)}
                        className="inline-flex items-center gap-1 rounded-full border border-coral/40 px-3 py-1 text-xs font-semibold text-coral-dark hover:bg-blush"
                      >
                        {a.label} <ArrowRight className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {busy && (
            <p className="flex items-center gap-2 text-xs text-ink/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking through your reviews…
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
              placeholder="Ask about your reviews…  e.g. Which staff member has the most reviews?"
              aria-label="Ask about your reviews"
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
          <p className="mt-2 text-[11px] text-ink/40">Uses your actual review data. It can&apos;t change, hide or remove reviews.</p>
        </form>
      </aside>
    </>
  );
}
