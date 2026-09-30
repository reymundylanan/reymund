"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { RecentAppointment } from "@/lib/supabase/queries/myGlow";
import { saveVisitReview, type VisitReview } from "@/lib/supabase/queries/visitReviews";
import { isPublicStatus, reviewErrorMessage, type ReviewStatus } from "@/lib/reviews";
import { MAX_REVIEW_PHOTOS, resizeToJpeg, validateReviewPhoto } from "@/lib/reviewPhotos";
import { formatAppointmentDate } from "@/lib/appointmentFormat";
import StarInput from "@/components/reviews/StarInput";
import ReviewPhotoPicker from "@/components/reviews/ReviewPhotoPicker";
import PhotoLightbox from "@/components/reviews/PhotoLightbox";

type Mode = "submit" | "edit" | "view";
type ServiceState = {
  rating: number;
  text: string;
  existing: { path: string; url: string }[];
  added: { blob: Blob; preview: string }[];
  photoError: string | null;
  status: ReviewStatus | null;
};
type PartState = { rating: number; text: string; status: ReviewStatus | null };

const TEXT_PLACEHOLDER = "Tell us about your service experience…";
const TEXT_CLASS =
  "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-coral";

function HiddenNote({ status }: { status: ReviewStatus | null }) {
  if (!status || isPublicStatus(status)) return null;
  return <p className="text-xs font-medium text-ink/50">Hidden by GlowSync</p>;
}

export default function VisitReviewModal({
  appointment,
  clientId,
  existing,
  mode,
  onClose,
  onSaved,
}: {
  appointment: RecentAppointment;
  clientId: string;
  existing?: VisitReview;
  mode: Mode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const readOnly = mode === "view";
  const [services, setServices] = useState<ServiceState[]>(() =>
    appointment.bookedServices.map((s) => {
      const part = existing?.services.find((p) => p.position === s.position);
      return {
        rating: part?.rating ?? 0,
        text: part?.text ?? "",
        existing: part?.photos ?? [],
        added: [],
        photoError: null,
        status: part?.status ?? null,
      };
    })
  );
  const [staff, setStaff] = useState<PartState>(() => ({
    rating: existing?.staff?.rating ?? 0,
    text: existing?.staff?.text ?? "",
    status: existing?.staff?.status ?? null,
  }));
  const [branch, setBranch] = useState<PartState>(() => ({
    rating: existing?.branch?.rating ?? 0,
    text: existing?.branch?.text ?? "",
    status: existing?.branch?.status ?? null,
  }));
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: { url: string }[]; index: number } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const previewsRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  // Revoke every preview URL still alive when the modal unmounts.
  useEffect(() => {
    const previews = previewsRef.current;
    return () => {
      previews.forEach((u) => URL.revokeObjectURL(u));
      previews.clear();
    };
  }, []);

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLButtonElement>("button[aria-pressed]:not(:disabled)");
    (first ?? panelRef.current)?.focus();
  }, []);

  useEffect(() => {
    if (lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, lightbox]);

  function patchService(i: number, patch: Partial<ServiceState>) {
    setServices((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function addPhotos(i: number, files: File[]) {
    let photoError: string | null = null;
    const room = MAX_REVIEW_PHOTOS - services[i].existing.length - services[i].added.length;
    const accepted: File[] = [];
    for (const file of files) {
      const problem = validateReviewPhoto(file);
      if (problem) photoError = problem;
      else if (accepted.length < room) accepted.push(file);
      else photoError = `You can add up to ${MAX_REVIEW_PHOTOS} photos.`;
    }
    const added: { blob: Blob; preview: string }[] = [];
    for (const file of accepted) {
      try {
        const blob = await resizeToJpeg(file);
        const preview = URL.createObjectURL(blob);
        previewsRef.current.add(preview);
        added.push({ blob, preview });
      } catch {
        photoError = "One of your photos couldn't be read. Please try another.";
      }
    }
    setServices((list) =>
      list.map((s, idx) => (idx === i ? { ...s, added: [...s.added, ...added], photoError } : s))
    );
  }

  function removeAdded(i: number, index: number) {
    const preview = services[i].added[index]?.preview;
    if (preview) {
      URL.revokeObjectURL(preview);
      previewsRef.current.delete(preview);
    }
    patchService(i, { added: services[i].added.filter((_, n) => n !== index), photoError: null });
  }

  const canSubmit = !saving && services.every((s) => s.rating > 0);

  async function submit() {
    if (!canSubmit || readOnly) return;
    if (appointment.professionalName && staff.text.trim() && staff.rating === 0) {
      setError("Tap a star to rate your therapist.");
      return;
    }
    if (appointment.branchId && branch.text.trim() && branch.rating === 0) {
      setError("Tap a star to rate the branch.");
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setError(null);
    const total = services.reduce((n, s) => n + s.added.length, 0);
    setProgress(total > 0 ? { done: 0, total } : null);
    const { error: saveError, code } = await saveVisitReview(
      createClient(),
      clientId,
      {
        appointmentId: appointment.id,
        services: services.map((s, i) => ({
          position: appointment.bookedServices[i].position,
          rating: s.rating,
          text: s.text,
          keep: s.existing.map((p) => p.path),
          add: s.added.map((p) => p.blob),
        })),
        staff: appointment.professionalName && staff.rating > 0 ? { rating: staff.rating, text: staff.text } : null,
        branch: appointment.branchId && branch.rating > 0 ? { rating: branch.rating, text: branch.text } : null,
      },
      mode === "edit" ? "edit" : "submit",
      (done, t) => setProgress({ done, total: t })
    );
    busyRef.current = false;
    setSaving(false);
    setProgress(null);
    if (saveError || code) {
      setError(saveError ?? reviewErrorMessage({ message: code ?? "" }));
      if (code === "REVIEW_DUPLICATE") onSaved();
      return;
    }
    setSaved(true);
    onSaved();
  }

  const serviceNames = appointment.bookedServices.map((s) => s.name).join(" + ");
  const editedAt = existing?.editedAt;
  const uploading = saving && progress !== null && progress.done < progress.total;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Service review"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 outline-none sm:max-w-lg sm:rounded-3xl"
      >
        {saved ? (
          <div className="py-8 text-center">
            <h3 className="text-lg font-semibold text-ink">Thank you for your review!</h3>
            <p className="mt-1 text-sm text-ink/60">
              {mode === "edit" ? "Your review was updated." : "Your review has been added to GlowSync."}
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-full bg-coral px-6 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-ink">{serviceNames}</h3>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                  <BadgeCheck className="h-3 w-3" /> Verified Service
                </span>
              </div>
              <p className="text-xs text-ink/50">
                {[appointment.professionalName, appointment.branchName, formatAppointmentDate(appointment.scheduledDate)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {mode === "edit" && (
                <p className="text-xs text-ink/50">Edited reviews show an &quot;Edited&quot; label.</p>
              )}
              {readOnly && editedAt && (
                <p className="text-xs text-ink/50">Edited · {formatAppointmentDate(editedAt)}</p>
              )}
            </div>

            <div className="mt-4 space-y-5">
              {appointment.bookedServices.map((b, i) => {
                const s = services[i];
                return (
                  <div key={b.position} className="space-y-2">
                    <p className="text-sm font-semibold text-ink">How was your {b.name}?</p>
                    <StarInput
                      value={s.rating}
                      onChange={readOnly ? undefined : (rating) => patchService(i, { rating })}
                    />
                    <HiddenNote status={s.status} />
                    <textarea
                      value={s.text}
                      onChange={(e) => patchService(i, { text: e.target.value })}
                      readOnly={readOnly}
                      rows={3}
                      maxLength={1000}
                      placeholder={readOnly ? undefined : TEXT_PLACEHOLDER}
                      className={TEXT_CLASS}
                    />
                    <ReviewPhotoPicker
                      existing={s.existing}
                      added={s.added}
                      onRemoveExisting={(path) =>
                        patchService(i, { existing: s.existing.filter((p) => p.path !== path), photoError: null })
                      }
                      onAdd={(files) => addPhotos(i, files)}
                      onRemoveAdded={(n) => removeAdded(i, n)}
                      onView={readOnly ? (n) => setLightbox({ photos: s.existing, index: n }) : undefined}
                      error={s.photoError}
                      disabled={readOnly || saving}
                    />
                  </div>
                );
              })}

              {appointment.professionalName && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ink">Your therapist — {appointment.professionalName}</p>
                  <StarInput
                    value={staff.rating}
                    onChange={readOnly ? undefined : (rating) => setStaff((p) => ({ ...p, rating }))}
                  />
                  <HiddenNote status={staff.status} />
                  <textarea
                    value={staff.text}
                    onChange={(e) => setStaff((p) => ({ ...p, text: e.target.value }))}
                    readOnly={readOnly}
                    rows={2}
                    maxLength={1000}
                    placeholder={readOnly ? undefined : TEXT_PLACEHOLDER}
                    className={TEXT_CLASS}
                  />
                </div>
              )}

              {appointment.branchId && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ink">
                    The branch — {appointment.branchName ?? "Blush Spa"} (optional)
                  </p>
                  <StarInput
                    value={branch.rating}
                    onChange={readOnly ? undefined : (rating) => setBranch((p) => ({ ...p, rating }))}
                  />
                  <HiddenNote status={branch.status} />
                  <textarea
                    value={branch.text}
                    onChange={(e) => setBranch((p) => ({ ...p, text: e.target.value }))}
                    readOnly={readOnly}
                    rows={2}
                    maxLength={1000}
                    placeholder={readOnly ? undefined : TEXT_PLACEHOLDER}
                    className={TEXT_CLASS}
                  />
                </div>
              )}
            </div>

            {error && (
              <div role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-full border border-ink/15 bg-white py-2 text-sm text-ink/60 hover:border-ink/30 disabled:opacity-50"
              >
                {readOnly ? "Close" : "Cancel"}
              </button>
              {!readOnly && (
                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className="flex-1 rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                >
                  {uploading && progress
                    ? `Uploading photos ${progress.done}/${progress.total}…`
                    : saving
                      ? "Saving…"
                      : mode === "edit"
                        ? "Save Changes"
                        : "Submit Review"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {lightbox && (
        <PhotoLightbox photos={lightbox.photos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
