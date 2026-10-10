import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeRatings } from "@/lib/reviews";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { pickQuote, type StaffQuote } from "@/lib/staffGuide";

export type PublicStaff = {
  id: string;
  fullName: string;
  department: string;
  branchName: string | null;
  avatarUrl: string | null;
  average: number;
  count: number;
  /** Newest 4★+ review with words in it, for GlowSync AI's introduction. */
  quote?: StaffQuote | null;
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
    supabase.from("public_staff_reviews").select("staff_id, rating, text, reviewer, created_at"),
  ]);
  if (error) logQueryError("getPublicStaffList", error);

  type Row = { staff_id: string; rating: number; text: string | null; reviewer: string; created_at: string };
  const byStaff = new Map<string, Row[]>();
  for (const r of (reviews ?? []) as Row[]) {
    const list = byStaff.get(r.staff_id) ?? [];
    list.push(r);
    byStaff.set(r.staff_id, list);
  }
  return ((staff ?? []) as ProfileRow[]).map((row) => {
    const list = byStaff.get(row.id) ?? [];
    return {
      ...toStaff(row, list.map((r) => r.rating)),
      quote: pickQuote(list.map((r) => ({ rating: r.rating, text: r.text, reviewer: r.reviewer, createdAt: r.created_at }))),
    };
  });
}

/** Service categories each department offers at each branch, most services
 * first — keyed "Branch name|Department". */
export async function getDepartmentCategories(supabase: SupabaseClient): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from("branch_services")
    .select("category, department, branch:branches(name)")
    .eq("status", "Active");
  if (error) {
    logQueryError("getDepartmentCategories", error);
    return {};
  }
  type Row = { category: string; department: string; branch: { name: string } | { name: string }[] | null };
  const counts = new Map<string, Map<string, number>>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const branch = Array.isArray(r.branch) ? r.branch[0]?.name : r.branch?.name;
    if (!branch || !r.department || !r.category) continue;
    const key = `${branch}|${r.department}`;
    const m = counts.get(key) ?? new Map<string, number>();
    m.set(r.category, (m.get(r.category) ?? 0) + 1);
    counts.set(key, m);
  }
  return Object.fromEntries(
    Array.from(counts.entries()).map(([k, m]) => [k, Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c)])
  );
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
