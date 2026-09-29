"use client";

import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import type { NotificationBroadcast, PromoOption } from "@/lib/supabase/queries/notificationBroadcasts";
import type { DispatchStatus, MessengerResults } from "@/lib/supabase/queries/messenger";

type MessengerInfo = DispatchStatus & {
  configured: boolean;
  missing: string[];
  connected: number;
  reachableNow: number;
};

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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function NotificationsManager({
  initialRecipientCount,
  initialHistory,
  promos,
  messenger,
  messengerResults,
}: {
  initialRecipientCount: number;
  initialHistory: NotificationBroadcast[];
  promos: PromoOption[];
  messenger: MessengerInfo;
  messengerResults: Record<string, MessengerResults>;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [linkTarget, setLinkTarget] = useState<"booking" | "promo">("booking");
  const [promoId, setPromoId] = useState("");
  const [useEmail, setUseEmail] = useState(true);
  const [useMessenger, setUseMessenger] = useState(messenger.configured);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [renderedAt] = useState(() => Date.now());

  const channels = [...(useEmail ? ["email"] : []), ...(useMessenger ? ["messenger"] : [])];
  const emailCount = useEmail ? initialRecipientCount : 0;
  const messengerCount = useMessenger ? messenger.connected : 0;
  const linkPath = linkTarget === "promo" ? `/promos/${promoId}` : "/?intent=booking";

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, linkTarget, promoId: linkTarget === "promo" ? promoId : undefined, channels }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setError(data?.error ?? "Failed to send. Please try again.");
        return;
      }

      const parts: string[] = [];
      if (useEmail) {
        parts.push(
          data.sentCount < data.totalRecipients
            ? `Email sent to ${data.sentCount} of ${data.totalRecipients} — some deliveries failed.`
            : `Email sent to ${plural(data.sentCount, "client")}.`
        );
      }
      if (useMessenger) parts.push(`Messenger queued for ${plural(data.messengerQueued, "client")}.`);
      setResult(parts.join(" "));

      setHistory((prev) => [
        {
          id: data.broadcastId,
          subject,
          message,
          link_path: linkPath,
          recipient_count: data.sentCount,
          created_at: new Date().toISOString(),
          sent_by_name: "You",
          channels,
        },
        ...prev,
      ]);
      setSubject("");
      setMessage("");
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  const canSend =
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    channels.length > 0 &&
    emailCount + messengerCount > 0 &&
    (linkTarget === "booking" || promoId !== "");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <MessageCircle className="h-4 w-4 text-coral-dark" /> Messenger
        </h2>
        {messenger.configured ? (
          <p className="mt-1 text-sm text-ink/60">
            {plural(messenger.connected, "client")} connected · {messenger.reachableNow} reachable for promos now (messaged the
            Page in the last 24h) · Last dispatch {messenger.lastRunAt ? formatRelative(messenger.lastRunAt) : "never"} ·{" "}
            {messenger.pendingCount} pending
            {messenger.oldestPendingAt && renderedAt - new Date(messenger.oldestPendingAt).getTime() > 10 * 60000 && (
              <span className="font-medium text-red-600"> — messages are waiting over 10 minutes; check the dispatch cron.</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink/60">
            Not configured — set {messenger.missing.join(", ")} to enable Messenger.
          </p>
        )}
      </div>

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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink/70">Link to</label>
              <select
                value={linkTarget}
                onChange={(e) => setLinkTarget(e.target.value as "booking" | "promo")}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
              >
                <option value="booking">Booking page</option>
                <option value="promo" disabled={promos.length === 0}>
                  A promo…
                </option>
              </select>
            </div>
            {linkTarget === "promo" && (
              <div>
                <label className="text-sm font-medium text-ink/70">Promo</label>
                <select
                  value={promoId}
                  onChange={(e) => setPromoId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                >
                  <option value="">Choose a promo</option>
                  {promos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-ink/70">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={useEmail} onChange={(e) => setUseEmail(e.target.checked)} /> Email
            </label>
            <label className={`flex items-center gap-2 ${messenger.configured ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                checked={useMessenger}
                disabled={!messenger.configured}
                onChange={(e) => setUseMessenger(e.target.checked)}
              />{" "}
              Messenger
            </label>
          </div>

          <p className="text-sm text-ink/50">
            {useEmail && `Email: ${plural(initialRecipientCount, "client")}`}
            {useEmail && useMessenger && " · "}
            {useMessenger &&
              `Messenger: ${messenger.connected} connected (${messenger.reachableNow} reachable now, within 24h)`}
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
            history.map((h) => {
              const m = messengerResults[h.id];
              return (
                <div key={h.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink">{h.subject}</p>
                    <span className="text-xs text-ink/40">{formatRelative(h.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink/50">
                    {h.sent_by_name}
                    {h.channels.includes("email") && <> · Email: {plural(h.recipient_count, "recipient")}</>}
                    {h.channels.includes("messenger") &&
                      (m ? (
                        <>
                          {" "}
                          · Messenger: {m.sent} sent, {m.skipped} skipped, {m.failed} failed
                          {m.pending > 0 && `, ${m.pending} pending`}
                        </>
                      ) : (
                        <> · Messenger: queued</>
                      ))}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="font-semibold text-ink">Send this broadcast?</h2>
            <p className="mt-2 text-sm text-ink/60">
              This sends <span className="font-medium text-ink">&ldquo;{subject}&rdquo;</span>
              {useEmail && (
                <>
                  {" "}
                  by email to <span className="font-medium text-ink">{plural(emailCount, "client")}</span>
                </>
              )}
              {useEmail && useMessenger && " and"}
              {useMessenger && (
                <>
                  {" "}
                  by Messenger to <span className="font-medium text-ink">{messenger.reachableNow}</span> of{" "}
                  {messenger.connected} connected clients (the rest are outside Meta&apos;s 24-hour window)
                </>
              )}
              . This can&apos;t be undone.
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
