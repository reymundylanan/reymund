"use client";

import { useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function useAssistantChat(greeting: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: greeting },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const next = [...messages, { role: "user" as const, content }];
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
      // Scroll only the chat's own message list, not the whole page —
      // scrollIntoView() would walk up every scrollable ancestor,
      // including the surrounding dashboard layout.
      setTimeout(() => {
        const el = containerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }

  return { messages, input, setInput, sending, send, containerRef };
}
