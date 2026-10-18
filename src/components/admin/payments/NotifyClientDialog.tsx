"use client";

import { useState } from "react";
import { BellRing, X } from "lucide-react";
import { paymentNoticeText, PAYMENT_NOTICE_MAX, type PaymentNoticePreset } from "@/lib/paymentNotice";

/** What the dialog needs to know about a pending payment. */
export type NoticePayment = { id: string; clientName: string; bookingCode: string | null; amount: number; method: string; branchName: string };

/** Pick a wording (or write your own) and send it to the client's bell, email and phone. */
export default function NotifyClientDialog({ payment: p, onClose, onSent }: { payment: NoticePayment; onClose: () => void; onSent: () => void }) {
  const [preset, setPreset] = useState<PaymentNoticePreset>(p.method === "gcash" ? "verifying" : "complete");
  const textFor = (k: PaymentNoticePreset) => paymentNoticeText(k, { amount: p.amount, bookingCode: p.bookingCode, method: p.method, branchName: p.branchName });
  const [message, setMessage] = useState(() => textFor(p.method === "gcash" ? "verifying" : "complete"));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: p.id, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "Couldn't send the notice.");
      else onSent();
    } catch {
      setError("Network error — please try again.");
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Notify client">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-coral-dark">Notify client</p>
            <h3 className="text-lg font-semibold text-ink">{p.clientName}</h3>
            <p className="text-sm text-ink/55">
              {p.bookingCode ?? "No booking code"} · ₱{p.amount.toLocaleString()} · {p.method === "gcash" ? "GCash" : p.method === "cash" ? "Cash" : p.method} · {p.branchName}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-full bg-cream p-1 text-sm">
          {(
            [
              ["verifying", "We're verifying it"],
              ["complete", "Please complete it"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPreset(k);
                setMessage(textFor(k));
              }}
              className={`rounded-full py-1.5 font-semibold transition ${preset === k ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium text-ink/75">
          <span className="flex items-baseline justify-between">
            Message <span className="text-xs font-normal text-ink/40">{message.length}/{PAYMENT_NOTICE_MAX}</span>
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, PAYMENT_NOTICE_MAX))}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-xl border border-[#e8dcc0] px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/15"
          />
        </label>
        <p className="mt-2 text-xs text-ink/50">Goes to the client&apos;s GlowSync bell, and by email and phone notification when they&apos;ve turned those on. It opens this booking.</p>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/30">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || !message.trim()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
          >
            <BellRing className="h-4 w-4" /> {sending ? "Sending…" : "Send notice"}
          </button>
        </div>
      </div>
    </div>
  );
}
