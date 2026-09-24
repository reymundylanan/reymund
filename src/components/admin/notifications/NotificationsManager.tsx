"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { NotificationBroadcast } from "@/lib/supabase/queries/notificationBroadcasts";

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function NotificationsManager({
  initialRecipientCount,
  initialHistory,
}: {
  initialRecipientCount: number;
  initialHistory: NotificationBroadcast[];
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/admin/notifications/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    const data = await res.json();
    setSending(false);
    setConfirming(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to send.");
      return;
    }

    setResult(
      data.sentCount < data.totalRecipients
        ? `Sent to ${data.sentCount} of ${data.totalRecipients} — some deliveries failed.`
        : `Sent to ${data.sentCount} client${data.sentCount === 1 ? "" : "s"}.`
    );
    setHistory((prev) => [
      {
        id: crypto.randomUUID(),
        subject,
        message,
        link_path: "/?intent=booking",
        recipient_count: data.sentCount,
        created_at: new Date().toISOString(),
        sent_by_name: "You",
      },
      ...prev,
    ]);
    setSubject("");
    setMessage("");
  }

  const canSend = subject.trim().length > 0 && message.trim().length > 0 && initialRecipientCount > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink">Compose Broadcast</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-ink/70">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. New Autumn Promo!"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink/70">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="What do you want to tell your clients?"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
          </div>

          <p className="text-sm text-ink/50">
            {initialRecipientCount === 0
              ? "No eligible recipients yet."
              : `This will send to ${initialRecipientCount} client${initialRecipientCount === 1 ? "" : "s"}.`}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && <p className="text-sm text-green-700">{result}</p>}

          <button
            onClick={() => setConfirming(true)}
            disabled={!canSend || sending}
            className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink">Broadcast History</h2>
        <div className="mt-4 divide-y divide-ink/5">
          {history.length === 0 ? (
            <p className="py-3 text-sm text-ink/50">No broadcasts sent yet.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{h.subject}</p>
                  <span className="text-xs text-ink/40">{formatRelative(h.created_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink/50">
                  {h.sent_by_name} · {h.recipient_count} recipient{h.recipient_count === 1 ? "" : "s"}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="font-semibold text-ink">Send this broadcast?</h2>
            <p className="mt-2 text-sm text-ink/60">
              This sends <span className="font-medium text-ink">&ldquo;{subject}&rdquo;</span> to{" "}
              <span className="font-medium text-ink">{initialRecipientCount}</span> client
              {initialRecipientCount === 1 ? "" : "s"} right now. This can&apos;t be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={sending}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "Sending..." : "Yes, Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
