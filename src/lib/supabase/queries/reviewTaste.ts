import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { summarizeReviewTaste, type ReviewTaste, type TasteReview } from "@/lib/reviewTaste";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Row = {
  target_type: string | null;
  rating: number;
  text: string | null;
  tags?: string[] | null;
  created_at: string;
  service: Rel<{ name: string; category: string | null }>;
  staff: Rel<{ full_name: string }>;
};

/** The client's own reviews, summarised (empty taste when there are none). */
export async function getClientReviewTaste(supabase: SupabaseClient, clientId: string): Promise<ReviewTaste> {
  const load = (cols: string) =>
    supabase
      .from("reviews")
      .select(cols)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(60);
  const base = "target_type, rating, text, created_at, service:branch_services(name, category), staff:staff_members(full_name)";
  let { data, error } = await load(`${base}, tags`);
  // `tags` arrives with migration 052; retry without it before that.
  if (error && error.code === "42703") ({ data, error } = await load(base));
  if (error) logQueryError("getClientReviewTaste", error);

  const reviews: TasteReview[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    targetType: r.target_type ?? "service",
    rating: Number(r.rating) || 0,
    text: r.text,
    tags: r.tags ?? [],
    serviceName: one(r.service)?.name ?? null,
    serviceCategory: one(r.service)?.category ?? null,
    staffName: one(r.staff)?.full_name ?? null,
    createdAt: r.created_at,
  }));
  return summarizeReviewTaste(reviews);
}
