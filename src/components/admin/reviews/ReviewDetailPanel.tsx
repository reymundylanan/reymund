"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";
import PhotoLightbox from "@/components/reviews/PhotoLightbox";
import { REPORT_REASONS } from "@/lib/reviews";
import { createClient } from "@/lib/supabase/client";
import {
  getAdminReviewDetail,
  markReviewsSeen,
  moderateReview,
  type AdminReviewDetail,
} from "@/lib/supabase/queries/adminReviews";
import { formatAppointmentDate, formatAppointmentTime } from "@/lib/appointmentFormat";

const ACTIONS = {
  visible: [
    { action: "hide", label: "Hide" },
    { action: "remove", label: "Remove" },
  ],
  flagged: [
    { action: "keep", label: "Keep" },
    { action: "hide", label: "Hide" },
    { action: "remove", label: "Remove" },
  ],
  hidden: [
    { action: "show", label: "Show" },
    { action: "remove", label: "Remove" },
  ],
  removed: [{ action: "restore", label: "Restore" }],
} as const;

export default function ReviewDetailPanel({
  reviewId,
  onClose,
  onChanged,
}: {
  reviewId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminReviewDetail | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function load() {
    const supabase = createClient();
    const d = await getAdminReviewDetail(supabase, reviewId);
    setDetail(d);
    if (d?.review.isNew) {
      await markReviewsSeen(supabase, [reviewId]);
      onChanged();
    }
  }

  useEffect(() => {
    // Deferred so setState happens in an async callback, not the effect body.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);

  async function act(action: "hide" | "show" | "remove" | "restore" | "keep") {
    if (action === "remove" && !confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    setError(null);
    const err = await moderateReview(createClient(), reviewId, action, action === "keep" ? "" : reason);
    setConfirmRemove(false);
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }
    if (action === "remove") {
      // Best-effort: delete the removed review's photo files; never block the UI on it.
      fetch("/api/admin/review-photos/purge", { method: "POST", body: JSON.stringify({ reviewId }) })
        .then((res) => {
          if (!res.ok) console.warn(`Photo purge failed (${res.status}).`);
        })
        .catch(() => console.warn("Photo purge request failed."));
    }
    setReason("");
    await load();
    setBusy(false);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Review details</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink/50 hover:bg-blush">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!detail ? (
          <p className="mt-6 text-sm text-ink/40">Loading…</p>
        ) : (
          <div className="mt-4 space-y-5 text-sm">
            <div>
              <p className="text-gold">{"★".repeat(detail.review.rating)}</p>
              <p className="mt-1 font-medium text-ink">{detail.review.targetName}</p>
              <p className="text-xs text-ink/50">
                {detail.review.clientName} ·{" "}
                {new Date(detail.review.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-ink/80">{detail.review.text ?? <span className="text-ink/40">No comment.</span>}</p>
              <p className="mt-2 text-xs capitalize text-ink/50">Status: {detail.review.status}</p>
            </div>

            {detail.photos.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-ink/40">Photos</p>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {detail.photos.map((url, i) => (
                    <button
                      key={url}
                      onClick={() => setLightboxIndex(i)}
                      aria-label={`View photo ${i + 1}`}
                      className="relative aspect-square overflow-hidden rounded-lg bg-blush"
                    >
                      <Image src={url} alt="" fill sizes="120px" unoptimized className="object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detail.reports.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-ink/40">Reports ({detail.reports.length})</p>
                <ul className="mt-1 space-y-2">
                  {detail.reports.map((r) => (
                    <li key={r.id} className="rounded-lg bg-amber-50 p-2 text-xs text-ink/70">
                      <span className="font-semibold text-amber-700">{REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</span>
                      {r.note && <p className="mt-0.5 whitespace-pre-wrap">{r.note}</p>}
                      <p className="mt-0.5 text-ink/40">
                        {r.reporterName} ·{" "}
                        {new Date(r.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.appointment && (
              <div className="rounded-xl border border-ink/10 p-3">
                <p className="text-xs font-semibold uppercase text-ink/40">Appointment</p>
                <p className="mt-1 text-ink">
                  {formatAppointmentDate(detail.appointment.scheduledDate)} · {formatAppointmentTime(detail.appointment.startTime)}
                </p>
                <p className="text-ink/60">
                  {detail.appointment.serviceName ?? "Service"}
                  {detail.appointment.therapistName && <> · {detail.appointment.therapistName}</>}
                  {detail.appointment.branchName && <> · {detail.appointment.branchName}</>}
                </p>
                {detail.appointment.bookingCode && <p className="text-xs text-ink/40">Ref: {detail.appointment.bookingCode}</p>}
                <Link href="/admin/bookings" className="mt-1 inline-block text-xs font-medium text-coral-dark hover:underline">
                  Open Bookings Management →
                </Link>
              </div>
            )}

            {detail.siblings.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-ink/40">Same visit</p>
                <ul className="mt-1 space-y-1">
                  {detail.siblings.map((s) => (
                    <li key={s.id} className="text-ink/70">
                      <span className="capitalize">{s.targetType}</span> — {"★".repeat(s.rating)} <span className="text-xs text-ink/40">({s.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                maxLength={300}
                className="w-full rounded-lg border border-ink/15 px-3 py-2"
              />
              {confirmRemove && <p className="text-xs text-red-600">Click Remove again to confirm.</p>}
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                {ACTIONS[detail.review.status].map((a) => (
                  <button
                    key={a.action}
                    disabled={busy}
                    onClick={() => act(a.action)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                      a.action === "remove" ? "bg-red-600 text-white" : "bg-coral text-white"
                    }`}
                  >
                    {busy ? "Saving…" : a.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-ink/40">Moderation history</p>
              {detail.history.length === 0 ? (
                <p className="mt-1 text-ink/40">No actions yet.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {detail.history.map((h) => (
                    <li key={h.id} className="text-xs text-ink/60">
                      <span className="font-medium capitalize text-ink">{h.action}</span> by {h.actorName} ·{" "}
                      {new Date(h.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
                      {h.reason && <> — {h.reason}</>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </aside>
      {detail && lightboxIndex !== null && (
        <div onClick={(e) => e.stopPropagation()}>
          <PhotoLightbox photos={detail.photos.map((url) => ({ url }))} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        </div>
      )}
    </div>
  );
}
