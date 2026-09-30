import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbService } from "@/components/services/ServiceCatalog";
import { summarizeRatings, type StarFilter } from "@/lib/reviews";
import { logQueryError } from "@/lib/supabase/logQueryError";

export const REVIEWS_PAGE = 10;

export type PublicServiceReview = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  editedAt: string | null;
  reviewer: string;
  staffId: string | null;
  staffName: string | null;
  serviceDate: string | null;
  photos: string[];
};

type SignFn = (paths: string[]) => Promise<Map<string, string>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublicService(supabase: SupabaseClient, id: string): Promise<DbService | null> {
  if (!UUID_RE.test(id)) return null;
  const { data: branchRow, error: branchErr } = await supabase
    .from("branches")
    .select("id")
    .eq("name", "One Cecilia Center")
    .maybeSingle();
  if (branchErr) logQueryError("getPublicService branch", branchErr);
  if (!branchRow?.id) return null;

  const { data, error } = await supabase
    .from("branch_services")
    .select("id, name, category, department, duration, price, price_41, description, benefits, hair_options, brows_type, body_wellness_type, facial_options, laser_type, slimming_type, non_surgical_type, doctor_type")
    .eq("branch_id", branchRow.id)
    .eq("id", id)
    .eq("status", "Active")
    .maybeSingle();
  if (error) logQueryError("getPublicService", error);
  return (data as DbService | null) ?? null;
}

export async function getServiceRatingSummary(supabase: SupabaseClient, serviceId: string) {
  const { data, error } = await supabase.from("public_service_reviews").select("rating").eq("service_id", serviceId);
  if (error) logQueryError("getServiceRatingSummary", error);
  return summarizeRatings(((data ?? []) as { rating: number }[]).map((r) => r.rating));
}

export async function getServiceRatings(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Record<string, { average: number; count: number }>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from("public_service_reviews").select("service_id, rating").in("service_id", ids);
  if (error) logQueryError("getServiceRatings", error);
  const byService = new Map<string, number[]>();
  for (const r of (data ?? []) as { service_id: string; rating: number }[]) {
    const list = byService.get(r.service_id) ?? [];
    list.push(r.rating);
    byService.set(r.service_id, list);
  }
  const out: Record<string, { average: number; count: number }> = {};
  for (const [id, list] of byService) {
    const s = summarizeRatings(list);
    out[id] = { average: s.average, count: s.count };
  }
  return out;
}

type ReviewRow = {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  edited_at: string | null;
  reviewer: string;
  staff_id: string | null;
  staff_name: string | null;
  service_date: string | null;
};

type PhotoRow = { review_id: string; storage_path: string; position: number };

export async function getServiceReviewPage(
  supabase: SupabaseClient,
  sign: SignFn,
  serviceId: string,
  filter: StarFilter,
  offset: number
): Promise<{ reviews: PublicServiceReview[]; hasMore: boolean }> {
  let query = supabase
    .from("public_service_reviews")
    .select("id, rating, text, created_at, edited_at, reviewer, staff_id, staff_name, service_date")
    .eq("service_id", serviceId);
  if (filter === "photos") query = query.gt("photo_count", 0);
  else if (filter !== "all") query = query.eq("rating", filter);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + REVIEWS_PAGE);
  if (error) logQueryError("getServiceReviewPage", error);

  const rows = (data ?? []) as ReviewRow[];
  const hasMore = rows.length > REVIEWS_PAGE;
  const page = rows.slice(0, REVIEWS_PAGE);
  if (page.length === 0) return { reviews: [], hasMore: false };

  const { data: photoData, error: photoErr } = await supabase
    .from("review_photos")
    .select("review_id, storage_path, position")
    .in("review_id", page.map((r) => r.id))
    .order("position");
  if (photoErr) logQueryError("getServiceReviewPage photos", photoErr);
  const photoRows = (photoData ?? []) as PhotoRow[];
  const signed = await sign(photoRows.map((p) => p.storage_path));

  const photosByReview = new Map<string, string[]>();
  for (const p of photoRows) {
    const url = signed.get(p.storage_path);
    if (!url) continue;
    const list = photosByReview.get(p.review_id) ?? [];
    list.push(url);
    photosByReview.set(p.review_id, list);
  }

  return {
    hasMore,
    reviews: page.map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      reviewer: r.reviewer,
      staffId: r.staff_id,
      staffName: r.staff_name,
      serviceDate: r.service_date,
      photos: photosByReview.get(r.id) ?? [],
    })),
  };
}

export async function getServicePhotoStrip(
  supabase: SupabaseClient,
  sign: SignFn,
  serviceId: string,
  limit = 12
): Promise<{ url: string; reviewId: string }[]> {
  const { data: reviewData, error } = await supabase
    .from("public_service_reviews")
    .select("id")
    .eq("service_id", serviceId)
    .gt("photo_count", 0)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) logQueryError("getServicePhotoStrip", error);
  const ids = ((reviewData ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];

  const { data: photoData, error: photoErr } = await supabase
    .from("review_photos")
    .select("review_id, storage_path, position")
    .in("review_id", ids)
    .order("position");
  if (photoErr) logQueryError("getServicePhotoStrip photos", photoErr);
  const rows = (photoData ?? []) as PhotoRow[];
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.review_id) ?? 0) - (order.get(b.review_id) ?? 0) || a.position - b.position);

  const signed = await sign(rows.map((p) => p.storage_path));
  const out: { url: string; reviewId: string }[] = [];
  for (const p of rows) {
    const url = signed.get(p.storage_path);
    if (url) out.push({ url, reviewId: p.review_id });
    if (out.length >= limit) break;
  }
  return out;
}

/** A completed visit of this client including the service that has no review yet. */
export async function getUnreviewedVisitForService(
  supabase: SupabaseClient,
  clientId: string,
  serviceId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, appointment_services!inner(service_id)")
    .eq("client_id", clientId)
    .eq("appointment_services.service_id", serviceId)
    .or("status.eq.completed,session_status.in.(completed,paid)")
    .order("scheduled_date", { ascending: false });
  if (error) logQueryError("getUnreviewedVisitForService", error);
  const ids = ((data ?? []) as { id: string }[]).map((a) => a.id);
  if (ids.length === 0) return null;

  const { data: reviewed, error: reviewErr } = await supabase.from("reviews").select("appointment_id").in("appointment_id", ids);
  if (reviewErr) logQueryError("getUnreviewedVisitForService reviews", reviewErr);
  const done = new Set(((reviewed ?? []) as { appointment_id: string }[]).map((r) => r.appointment_id));
  return ids.find((id) => !done.has(id)) ?? null;
}
