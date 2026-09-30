"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { loginRedirectPath } from "@/lib/loginRedirect";
import { REPORT_REASONS, reviewErrorMessage, type ReportReason } from "@/lib/reviews";

/** `onOpenChange` lets a parent menu hide itself while the dialog is open
 * (keep the button mounted — unmounting it would close the dialog) and
 * close itself afterwards. */
export default function ReportReviewButton({
  reviewId,
  onOpenChange,
}: {
  reviewId: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const { user, loading } = useCurrentUser();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href={loginRedirectPath(pathname)}
        className="block px-3 py-2 text-left text-sm text-ink/70 hover:bg-blush/50"
      >
        Sign in to report
      </Link>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createClient().rpc("report_review", {
        p_review_id: reviewId,
        p_reason: reason,
        p_note: note.trim() || null,
      });
      if (rpcError) {
        setError(rpcError.message?.trim() === "REVIEW_NOT_ALLOWED" ? "You can't report this review." : reviewErrorMessage(rpcError));
        return;
      }
      setDone(true);
    } catch {
      setError("Couldn't send your report. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function openDialog() {
    setOpen(true);
    onOpenChange?.(true);
  }

  function close() {
    setOpen(false);
    setDone(false);
    setError(null);
    setNote("");
    onOpenChange?.(false);
  }

  return (
    <>
      <button onClick={openDialog} className="block w-full px-3 py-2 text-left text-sm text-ink/70 hover:bg-blush/50">
        Report review
      </button>
      {open &&
        createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Report review">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-ink">Report this review</h3>
            {done ? (
              <>
                <p className="mt-3 text-sm text-ink/70">Thanks — our team will check it.</p>
                <button onClick={close} className="mt-5 rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
                  Close
                </button>
              </>
            ) : (
              <>
                <fieldset className="mt-3 space-y-2">
                  <legend className="sr-only">Reason</legend>
                  {REPORT_REASONS.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm text-ink">
                      <input type="radio" name={`report-reason-${reviewId}`} checked={reason === r.value} onChange={() => setReason(r.value)} />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Add a note (optional)"
                  className="mt-3 w-full rounded-xl border border-ink/10 p-2 text-sm outline-none focus:border-coral"
                />
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={close} className="rounded-full px-4 py-2 text-sm text-ink/60 hover:bg-ink/5">
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy}
                    className="rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-60"
                  >
                    {busy ? "Sending..." : "Send Report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
