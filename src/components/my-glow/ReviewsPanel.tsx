"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  submitReview,
  type DefaultBranch,
  type MyReview,
  type ReviewableProfessional,
} from "@/lib/supabase/queries/myGlow";

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} star`}>
          <Star className={`h-5 w-5 ${n <= value ? "fill-gold text-gold" : "text-ink/20"}`} />
        </button>
      ))}
    </div>
  );
}

function ReviewForm({
  targetLabel,
  onSubmit,
}: {
  targetLabel: string;
  onSubmit: (rating: number, text: string) => Promise<string | null>;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (rating === 0) {
      setError("Please pick a star rating.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const err = await onSubmit(rating, text);
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <div className="rounded-2xl border border-ink/10 p-4">
      <p className="text-sm font-medium text-ink">{targetLabel}</p>
      <div className="mt-2">
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share your experience..."
        rows={3}
        className="mt-2 w-full rounded-xl border border-ink/15 p-2 text-sm outline-none focus:border-coral"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-2 rounded-full bg-coral px-4 py-1.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-40"
      >
        {submitting ? "Submitting…" : "Write a Review"}
      </button>
    </div>
  );
}

export default function ReviewsPanel({
  clientId,
  reviewable,
  defaultBranch,
  myReviews,
}: {
  clientId: string;
  reviewable: ReviewableProfessional[];
  defaultBranch: DefaultBranch;
  myReviews: MyReview[];
}) {
  const [tab, setTab] = useState<"write" | "mine">("write");
  const router = useRouter();

  async function handleSubmit(
    target: { professionalId?: string; branchId?: string },
    rating: number,
    text: string
  ): Promise<string | null> {
    const supabase = createClient();
    const { error } = await submitReview(supabase, {
      clientId,
      rating,
      text,
      ...target,
    });
    if (!error) router.refresh();
    return error;
  }

  return (
    <div id="reviews" className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="text-lg font-semibold text-ink">Reviews & Comments</h3>

      <div className="mt-3 flex gap-4 border-b border-ink/10 text-sm font-medium">
        <button
          onClick={() => setTab("write")}
          className={`pb-2 ${tab === "write" ? "border-b-2 border-coral text-coral-dark" : "text-ink/50"}`}
        >
          Write a Review
        </button>
        <button
          onClick={() => setTab("mine")}
          className={`pb-2 ${tab === "mine" ? "border-b-2 border-coral text-coral-dark" : "text-ink/50"}`}
        >
          My Reviews ({myReviews.length})
        </button>
      </div>

      {tab === "write" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {reviewable[0] ? (
            <ReviewForm
              targetLabel={`Review ${reviewable[0].professionalName}`}
              onSubmit={(rating, text) =>
                handleSubmit({ professionalId: reviewable[0].professionalId }, rating, text)
              }
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-ink/15 p-4 text-sm text-ink/50">
              Book and complete a service to review your therapist.
            </div>
          )}

          {defaultBranch ? (
            <ReviewForm
              targetLabel={`Review ${defaultBranch.name}`}
              onSubmit={(rating, text) =>
                handleSubmit({ branchId: defaultBranch.id }, rating, text)
              }
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-ink/15 p-4 text-sm text-ink/50">
              Visit a branch to leave a spa review.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {myReviews.length === 0 && (
            <p className="py-6 text-center text-sm text-ink/40">No reviews yet.</p>
          )}
          {myReviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-ink/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">{r.targetName}</p>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`h-4 w-4 ${n <= r.rating ? "fill-gold text-gold" : "text-ink/20"}`}
                    />
                  ))}
                </div>
              </div>
              {r.text && <p className="mt-1 text-sm text-ink/60">{r.text}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
