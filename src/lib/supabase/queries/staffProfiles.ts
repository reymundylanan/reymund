import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeRatings } from "@/lib/reviews";

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
  if (error) console.error("getPublicStaffList failed:", error);

  const ratingsByStaff = new Map<string, number[]>();
  for (const r of (reviews ?? []) as { staff_id: string; rating: number }[]) {
    const list = ratingsByStaff.get(r.staff_id) ?? [];
    list.push(r.rating);
    ratingsByStaff.set(r.staff_id, list);
  }
  return ((staff ?? []) as ProfileRow[]).map((row) => toStaff(row, ratingsByStaff.get(row.id) ?? []));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublicStaffProfile(supabase: SupabaseClient, id: string) {
  if (!UUID_RE.test(id)) return null;
  const [{ data: row }, { data: reviews, error }] = await Promise.all([
    supabase.from("public_staff_profiles").select("id, full_name, department, branch_name, avatar_url").eq("id", id).maybeSingle(),
    supabase
      .from("public_staff_reviews")
      .select("id, rating, text, created_at, reviewer")
      .eq("staff_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (error) console.error("getPublicStaffProfile reviews failed:", error);
  if (!row) return null;

  const list = (reviews ?? []) as { id: string; rating: number; text: string | null; created_at: string; reviewer: string }[];
  return {
    staff: toStaff(row as ProfileRow, list.map((r) => r.rating)),
    summary: summarizeRatings(list.map((r) => r.rating)),
    reviews: list.map((r) => ({ id: r.id, rating: r.rating, text: r.text, createdAt: r.created_at, reviewer: r.reviewer })),
  };
}
