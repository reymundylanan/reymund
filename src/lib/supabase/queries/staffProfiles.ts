import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeRatings } from "@/lib/reviews";
import { logQueryError } from "@/lib/supabase/logQueryError";

export type PublicStaff = {
  id: string;
  fullName: string;
  department: string;
  branchName: string | null;
  avatarUrl: string | null;
  average: number;
  count: number;
};

type ProfileRow = {
  id: string;
  full_name: string;
  department: string;
  branch_name: string | null;
  avatar_url: string | null;
};

function toStaff(row: ProfileRow, ratings: number[]): PublicStaff {
  const s = summarizeRatings(ratings);
  return {
    id: row.id,
    fullName: row.full_name,
    department: row.department,
    branchName: row.branch_name,
    avatarUrl: row.avatar_url,
    average: s.average,
    count: s.count,
  };
}

export async function getPublicStaffList(supabase: SupabaseClient): Promise<PublicStaff[]> {
  const [{ data: staff, error }, { data: reviews }] = await Promise.all([
    supabase.from("public_staff_profiles").select("id, full_name, department, branch_name, avatar_url").order("full_name"),
    supabase.from("public_staff_reviews").select("staff_id, rating"),
  ]);
  if (error) logQueryError("getPublicStaffList", error);

  const ratingsByStaff = new Map<string, number[]>();
  for (const r of (reviews ?? []) as { staff_id: string; rating: number }[]) {
    const list = ratingsByStaff.get(r.staff_id) ?? [];
    list.push(r.rating);
    ratingsByStaff.set(r.staff_id, list);
  }
  return ((staff ?? []) as ProfileRow[]).map((row) => toStaff(row, ratingsByStaff.get(row.id) ?? []));
}

export type PublicStaffReview = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  reviewer: string;
  serviceName: string | null;
  serviceDate: string | null;
  editedAt: string | null;
};

type ReviewRow = {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  reviewer: string;
  service_name?: string | null;
  service_date?: string | null;
  edited_at?: string | null;
};

const UUID_RE =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublicStaffProfile(supabase: SupabaseClient, id: string) {
  if (!UUID_RE.test(id)) return null;
  const fetchReviews = (columns: string) =>
    supabase.from("public_staff_reviews").select(columns).eq("staff_id", id).order("created_at", { ascending: false });

  const [{ data: row, error: rowError }, extended] = await Promise.all([
    supabase.from("public_staff_profiles").select("id, full_name, department, branch_name, avatar_url").eq("id", id).maybeSingle(),
    fetchReviews("id, rating, text, created_at, reviewer, service_name, service_date, edited_at"),
  ]);
  if (rowError) logQueryError("getPublicStaffProfile", rowError);

  // Before migration 051 is applied the new columns don't exist; retry with the old list.
  let reviews = extended.data as unknown as ReviewRow[] | null;
  if (extended.error) {
    logQueryError("getPublicStaffProfile reviews", extended.error);
    const fallback = await fetchReviews("id, rating, text, created_at, reviewer");
    if (fallback.error) logQueryError("getPublicStaffProfile reviews (fallback)", fallback.error);
    reviews = fallback.data as unknown as ReviewRow[] | null;
  }
  if (!row) return null;

  const list = reviews ?? [];
  return {
    staff: toStaff(row as ProfileRow, list.map((r) => r.rating)),
    summary: summarizeRatings(list.map((r) => r.rating)),
    reviews: list.map(
      (r): PublicStaffReview => ({
        id: r.id,
        rating: r.rating,
        text: r.text,
        createdAt: r.created_at,
        reviewer: r.reviewer,
        serviceName: r.service_name ?? null,
        serviceDate: r.service_date ?? null,
        editedAt: r.edited_at ?? null,
      }),
    ),
  };
}
