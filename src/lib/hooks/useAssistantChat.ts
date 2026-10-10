"use client";

import { useRef, useState } from "react";

export type ServiceRecommendation = {
  id: string;
  name: string;
  price: number;
  /** e.g. "₱1,200" or "Short ₱1,000 · Medium ₱1,500 · Long ₱2,000". */
  priceLabel?: string;
  duration?: string | null;
  description: string | null;
  category: string;
};

// Never leave the client staring at a typing indicator: give up after this long.
const REPLY_TIMEOUT_MS = 35_000;

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

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REPLY_TIMEOUT_MS);
    try {
      const res = await fetch("/api/assistant", {
        signal: abort.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only role/content go to the model — recommendation cards are UI-only.
        // The page they're on, so GlowSync AI can explain what it's for.
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), page: window.location.pathname }),
      });
      const data = await res.json().catch(() => ({ error: "GlowSync AI is busy right now — please try again in a moment." }));
      setMessages((list) => [
        ...list,
        res.ok
          ? { role: "assistant", content: data.reply, recommendations: data.recommendations ?? [] }
          : { role: "assistant", content: data.error ?? "Something went wrong." },
      ]);
    } catch (e) {
      setMessages((list) => [
        ...list,
        {
          role: "assistant",
          content: e instanceof DOMException && e.name === "AbortError" ? "That took too long — please ask me again." : "Network error — try again.",
        },
      ]);
    } finally {
      clearTimeout(timer);
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

  /** A question answered right here, without the AI (e.g. "What can I do on this page?"). */
  function answerLocally(question: string, answer: string) {
    setMessages((list) => [...list, { role: "user", content: question }, { role: "assistant", content: answer }]);
    setTimeout(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  return { messages, input, setInput, sending, send, answerLocally, containerRef };
}
