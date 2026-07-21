"use client";

import { useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const GREETING: Message = {
  role: "assistant",
  content:
    "Hi! I'm the Blush Assistant. Ask me about services, prices, or branches — I can help you decide what to book.",
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages((list) => [
        ...list,
        {
          role: "assistant",
          content: res.ok ? data.reply : (data.error ?? "Something went wrong."),
        },
      ]);
    } catch {
      setMessages((list) => [
        ...list,
        { role: "assistant", content: "Network error — try again." },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {open && (
        <div className="mb-3 flex h-[36rem] w-96 flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-coral px-4 py-3 text-white">
            <p className="text-base font-bold tracking-wide"><span className="uppercase">Blush</span> Assistant</p>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1 hover:bg-white/20">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto scrollbar-hidden p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-coral text-white"
                    : "bg-blush text-ink"
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
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-ink/10 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type your message..."
              className="flex-1 rounded-full border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
            <button
              onClick={sendMessage}
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
