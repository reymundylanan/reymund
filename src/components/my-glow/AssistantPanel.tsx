"use client";

import { Send, Sparkles } from "lucide-react";
import { useAssistantChat } from "@/lib/hooks/useAssistantChat";

const SUGGESTED_PROMPTS = [
  "Recommend a service for me",
  "Check my bookings",
  "Track my Glow Journey",
  "Find the best time to book",
  "Ask about promotions",
];

export default function AssistantPanel({ firstName }: { firstName: string }) {
  const { messages, input, setInput, sending, send, containerRef } = useAssistantChat(
    `Hi ${firstName}! ✨ How can I help you today?`
  );

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-3xl border border-rose/60 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-coral-dark" />
        <h3 className="text-lg font-semibold text-ink">AI Assistant</h3>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
              m.role === "user" ? "ml-auto bg-coral text-white" : "bg-blush text-ink"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="max-w-[90%] rounded-2xl bg-blush px-3 py-2 text-sm text-ink/50">
            Typing…
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => send(prompt)}
            disabled={sending}
            className="rounded-full border border-coral/40 px-3 py-1.5 text-left text-xs font-medium text-coral-dark hover:bg-blush disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-ink/10 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type your message..."
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
