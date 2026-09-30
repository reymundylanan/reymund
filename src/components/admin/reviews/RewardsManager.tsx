"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import PhotoLightbox from "@/components/reviews/PhotoLightbox";
import { reviewerName } from "@/lib/reviews";
import { formatAppointmentDate } from "@/lib/appointmentFormat";
import { createClient } from "@/lib/supabase/client";
import { logQueryError } from "@/lib/supabase/logQueryError";
import {
  getRewardSettings,
  getRewardStats,
  listRewardQueue,
  retryEvaluation,
  saveRewardSettings,
  validateSettings,
  type QueueItem,
  type RewardSettings,
} from "@/lib/supabase/queries/adminRewards";
import EvaluationCard from "./EvaluationCard";
import RedemptionAdmin from "./RedemptionAdmin";

type Stats = Awaited<ReturnType<typeof getRewardStats>>;

const TARGET_LABEL = { service: "Service", staff: "Therapist", branch: "Branch" } as const;

type Form = Record<"rating" | "meaningful" | "specific" | "relevant" | "photo" | "partial" | "max", string> & { enabled: boolean };

function toForm(s: RewardSettings): Form {
  return {
    rating: String(s.ratingPoints),
    meaningful: String(s.meaningfulPoints),
    specific: String(s.specificPoints),
    relevant: String(s.relevantPoints),
    photo: String(s.photoPoints),
    partial: String(Math.round(s.partialRatio * 100)),
    max: String(s.maxPoints),
    enabled: s.enabled,
  };
}

function num(v: string) {
  return v.trim() === "" ? NaN : Number(v);
}

function toSettings(f: Form): RewardSettings {
  return {
    ratingPoints: num(f.rating),
    meaningfulPoints: num(f.meaningful),
    specificPoints: num(f.specific),
    relevantPoints: num(f.relevant),
    photoPoints: num(f.photo),
    partialRatio: num(f.partial) / 100,
    maxPoints: num(f.max),
    enabled: f.enabled,
  };
}

export default function RewardsManager({
  initialQueue,
  initialSettings,
  initialStats,
}: {
  initialQueue: QueueItem[];
  initialSettings: RewardSettings | null;
  initialStats: Stats;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [stats, setStats] = useState(initialStats);
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState<Form | null>(initialSettings ? toForm(initialSettings) : null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const supabase = createClient();
      const [q, s] = await Promise.all([listRewardQueue(supabase), getRewardStats(supabase)]);
      setQueue(q);
      setStats(s);
    } catch (e) {
      console.error("reload rewards failed:", e);
    }
  }, []);

  const pathsKey = queue.flatMap((i) => i.parts.flatMap((p) => p.photoPaths)).join("|");
  useEffect(() => {
    const paths = pathsKey ? pathsKey.split("|") : [];
    if (paths.length === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await createClient().storage.from("review-photos").createSignedUrls(paths, 3600);
      if (error) logQueryError("RewardsManager sign photos", error);
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const s of data ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      setUrls(map);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pathsKey]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 5000);
  }

  async function retry(id: string) {
    setRetrying(id);
    setRetryError(null);
    const err = await retryEvaluation(createClient(), id);
    setRetrying(null);
    if (err) setRetryError(err);
    else await reload();
  }

  const formInvalid = form ? validateSettings(toSettings(form)) : null;

  function requestSave() {
    if (!form) return;
    const err = validateSettings(toSettings(form));
    setFormError(err);
    if (!err) setConfirming(true);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const next = toSettings(form);
    const err = await saveRewardSettings(createClient(), next);
    setSaving(false);
    setConfirming(false);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSettings(next);
    showToast("Reward settings saved.");
    getRewardSettings(createClient()).then((s) => s && setSettings(s));
  }

  const needsReview = queue.filter((i) => i.evaluation.status === "needs_review");
  const failed = queue.filter((i) => i.evaluation.status === "failed");
  const input = "w-24 rounded-lg border border-ink/15 px-3 py-2 text-sm";
  const fields: { key: keyof Omit<Form, "enabled">; label: string; suffix: string }[] = [
    { key: "rating", label: "Rating", suffix: "pts" },
    { key: "meaningful", label: "Meaningful feedback", suffix: "pts" },
    { key: "specific", label: "Specific feedback", suffix: "pts" },
    { key: "relevant", label: "Relevant service feedback", suffix: "pts" },
    { key: "photo", label: "Photo", suffix: "pts" },
    { key: "partial", label: "Partial credit", suffix: "%" },
    { key: "max", label: "Max points per review", suffix: "pts" },
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin/reviews" className="inline-flex items-center gap-1 text-sm font-medium text-coral-dark hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to reviews
      </Link>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink/40">Points issued this month</p>
          <p className="mt-1 text-xl font-semibold text-ink">{stats.pointsThisMonth}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink/40">Reviews rewarded</p>
          <p className="mt-1 text-xl font-semibold text-ink">{stats.reviewsRewarded}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink/40">Average points</p>
          <p className="mt-1 text-xl font-semibold text-ink">{stats.averagePoints}</p>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-ink">Needs Review ({needsReview.length})</h2>
        {needsReview.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/40">Nothing needs review right now.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {needsReview.map((item) => (
              <div key={item.evaluation.id} className="rounded-2xl border border-ink/10 p-4">
                <p className="text-sm font-medium text-ink">
                  {reviewerName(item.clientName)}
                  {item.visitDate && <span className="font-normal text-ink/50"> · {formatAppointmentDate(item.visitDate)}</span>}
                </p>
                {item.serviceNames.length > 0 && <p className="text-xs text-ink/50">{item.serviceNames.join(", ")}</p>}

                <div className="mt-3 space-y-3">
                  {item.parts.map((p, i) => {
                    const photos = p.photoPaths.map((path) => urls[path]).filter((u): u is string => !!u);
                    return (
                      <div key={i} className="rounded-xl bg-blush/40 p-3 text-sm">
                        <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                          {TARGET_LABEL[p.targetType]}
                          {p.serviceName && <span className="font-normal text-ink/50">{p.serviceName}</span>}
                          <span className="ml-auto flex items-center gap-0.5 text-gold">
                            <Star className="h-3.5 w-3.5 fill-gold" /> {p.rating}
                          </span>
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-ink/70">{p.text ?? <span className="text-ink/40">No comment.</span>}</p>
                        {p.tags.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {p.tags.map((t) => (
                              <span key={t} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-ink/60">
                                {t}
                              </span>
                            ))}
                          </p>
                        )}
                        {photos.length > 0 && (
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {photos.map((url, idx) => (
                              <button
                                key={url}
                                onClick={() => setLightbox({ photos, index: idx })}
                                aria-label={`View photo ${idx + 1}`}
                                className="relative aspect-square overflow-hidden rounded-lg bg-blush"
                              >
                                <Image src={url} alt="" fill sizes="100px" unoptimized className="object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <EvaluationCard evaluation={item.evaluation} admin onChanged={reload} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-ink">Failed ({failed.length})</h2>
        {retryError && <p className="mt-2 text-xs text-red-600">{retryError}</p>}
        {failed.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/40">No failed evaluations.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink/5">
            {failed.map((item) => (
              <li key={item.evaluation.id} className="flex items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {reviewerName(item.clientName)}
                    {item.visitDate && <span className="font-normal text-ink/50"> · {formatAppointmentDate(item.visitDate)}</span>}
                  </p>
                  <p className="text-xs text-red-600">Last error: {item.evaluation.lastError ?? "unknown"}</p>
                </div>
                <button
                  disabled={retrying === item.evaluation.id}
                  onClick={() => retry(item.evaluation.id)}
                  className="rounded-full bg-coral px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {retrying === item.evaluation.id ? "Retrying…" : "Retry"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-ink">Reward Settings</h2>
        {!form || !settings ? (
          <p className="py-6 text-center text-sm text-ink/40">Rewards aren&apos;t set up yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 text-sm text-ink">
                  {f.label}
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className={input}
                    />
                    <span className="w-7 text-xs text-ink/40">{f.suffix}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              Rewards enabled
            </label>
            {(formError ?? formInvalid) && <p className="text-xs text-red-600">{formError ?? formInvalid}</p>}
            <button
              onClick={requestSave}
              disabled={saving || !!formInvalid}
              className="rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save settings
            </button>
          </div>
        )}
      </section>

      <RedemptionAdmin />

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirming(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-ink">Save reward settings?</p>
            <p className="mt-1 text-sm text-ink/60">New values apply to future reviews only.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirming(false)} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {lightbox && <PhotoLightbox photos={lightbox.photos.map((url) => ({ url }))} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
