"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useAssistantChat } from "@/lib/hooks/useAssistantChat";

const GREETING =
  "Hi! I'm the Blush Assistant. Ask me about services, prices, or branches — I can help you decide what to book.";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const { messages, input, setInput, sending, send, containerRef } = useAssistantChat(GREETING);

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {open && (
        <div className="mb-3 flex h-[36rem] w-96 flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-coral px-4 py-3 text-white">
            <p className="text-base font-bold tracking-wide">
              <span className="uppercase">Blush</span> Assistant
            </p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-full p-1 hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div
            ref={containerRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-hidden p-4"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "ml-auto bg-coral text-white" : "bg-blush text-ink"
                }`}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="max-w-[85%] rounded-2xl bg-blush px-3 py-2 text-sm text-ink/50">
                Typing…
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-ink/10 p-3">
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
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open GlowSync assistant"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white shadow-xl hover:bg-coral-dark"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </div>
  );
}
