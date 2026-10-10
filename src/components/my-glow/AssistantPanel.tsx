"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { useAssistantChat } from "@/lib/hooks/useAssistantChat";
import GlowMascot from "@/components/GlowMascot";
import { TypingDots } from "@/components/ChatWidget";
import { pageHelpMessage } from "@/lib/pageHelp";

const PAGE_HELP_Q = "What can I do on this page?";
const SUGGESTED_PROMPTS = [
  PAGE_HELP_Q,
  "Recommend a service for me",
  "Check my bookings",
  "Track my Glow Journey",
  "Ask about promotions",
];

export default function AssistantPanel({ firstName }: { firstName: string }) {
  const { messages, input, setInput, sending, send, answerLocally, containerRef } = useAssistantChat(
    `Hi ${firstName}! ✨ How can I help you today?`
  );
  const userHasSpoken = messages.some((m) => m.role === "user");

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending, containerRef]);

  return (
    <div className="flex h-[600px] flex-col overflow-hidden rounded-3xl border border-rose/60 bg-white">
      <div className="flex items-center gap-3 bg-gradient-to-r from-coral to-coral-dark px-5 py-3 text-white">
        <span className="rounded-full bg-white/95 p-0.5 shadow-sm">
          <GlowMascot size={38} talking={sending} />
        </span>
        <div>
          <h3 className="text-base font-bold leading-tight tracking-wide">GlowSync AI</h3>
          <p className="flex items-center gap-1.5 text-xs text-white/85">
            <span className="h-2 w-2 rounded-full bg-[#7ddc8f]" /> Your Blush assistant · Online
          </p>
        </div>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain bg-cream/40 p-4">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="glowy-msg ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-coral px-3 py-2 text-sm text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="glowy-msg space-y-2">
              <div className="flex items-end gap-2">
                <GlowMascot size={28} />
                <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-blush px-3 py-2 text-sm text-ink">{m.content}</div>
              </div>
              {m.recommendations && m.recommendations.length > 0 && (
                <div className="max-w-[90%] space-y-2 pl-9">
                  {m.recommendations.map((s) => (
                    <div key={s.id} className="rounded-xl border border-ink/10 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">{s.name}</p>
                        <span className="shrink-0 text-sm font-semibold text-coral-dark">₱{s.price.toLocaleString()}</span>
                      </div>
                      {s.description && <p className="mt-1 line-clamp-2 text-xs text-ink/50">{s.description}</p>}
                      <Link
                        href={`/services?category=${encodeURIComponent(s.category)}`}
                        className="mt-2 inline-block rounded-full bg-coral px-3 py-1 text-xs font-semibold text-white hover:bg-coral-dark"
                      >
                        Book Now
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {/* Fills the empty chat with a waving GlowSync AI until the client asks something. */}
        {!userHasSpoken && !sending && (
          <div className="glowy-msg flex flex-col items-center pt-6 text-center">
            <div className="relative rounded-full bg-gradient-to-br from-cream to-champagne/50 p-3">
              <span className="glowy-bob">
                <GlowMascot size={120} full />
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">I&apos;m GlowSync AI ✨</p>
            <p className="mt-1 max-w-[16rem] text-xs text-ink/60">
              Ask me for treatment ideas, your bookings, your Glow Journey or the latest promos.
            </p>
          </div>
        )}

        {sending && (
          <div className="flex items-end gap-2">
            <GlowMascot size={28} talking />
            <TypingDots />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => (prompt === PAGE_HELP_Q ? answerLocally(prompt, pageHelpMessage("/my-glow")) : send(prompt))}
            disabled={sending}
            className="rounded-full border border-coral/40 px-3 py-1.5 text-left text-xs font-medium text-coral-dark transition hover:-translate-y-0.5 hover:bg-blush disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-ink/10 p-4 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask GlowSync AI anything..."
          className="flex-1 rounded-full border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          aria-label="Send"
          className="rounded-full bg-coral p-2.5 text-white hover:bg-coral-dark disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
