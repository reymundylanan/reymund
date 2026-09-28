"use client";

import { useRef, useState } from "react";

export type ServiceRecommendation = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  category: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  recommendations?: ServiceRecommendation[];
};

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
        // Only role/content go to the model — recommendation cards are UI-only.
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      setMessages((list) => [
        ...list,
        res.ok
          ? { role: "assistant", content: data.reply, recommendations: data.recommendations ?? [] }
          : { role: "assistant", content: data.error ?? "Something went wrong." },
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
