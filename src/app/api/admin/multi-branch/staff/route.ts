import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/multiBranch/server";
import { summarizeRatings } from "@/lib/reviews";
import { logQueryError } from "@/lib/supabase/logQueryError";

/** Extra details for one staff member: phone, shift type and their reviews. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Missing staff member." }, { status: 400 });

  const [staff, reviews] = await Promise.all([
    gate.admin.from("staff_members").select("phone, shift_type, created_at").eq("id", id).maybeSingle(),
    gate.admin
      .from("reviews")
      .select("rating, text, created_at, client:profiles!reviews_client_id_fkey(full_name)")
      .eq("target_type", "staff")
      .eq("staff_id", id)
      .in("status", ["visible", "flagged"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (staff.error) logQueryError("staff details", staff.error);
  // Without the named relationship, fall back to reviews without names.
  let rows = (reviews.data ?? []) as { rating: number; text: string | null; created_at: string; client?: { full_name: string | null } | { full_name: string | null }[] | null }[];
  if (reviews.error) {
    const plain = await gate.admin
      .from("reviews")
      .select("rating, text, created_at")
      .eq("target_type", "staff")
      .eq("staff_id", id)
      .in("status", ["visible", "flagged"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (plain.error) logQueryError("staff details reviews", plain.error);
    rows = (plain.data ?? []) as typeof rows;
  }
  const summary = summarizeRatings(rows.map((r) => Number(r.rating) || 0));
  const s = staff.data as { phone: string | null; shift_type: string | null; created_at: string | null } | null;
  return NextResponse.json({
    phone: s?.phone ?? null,
    shiftType: s?.shift_type ?? null,
    since: s?.created_at ?? null,
    rating: { average: summary.average, count: summary.count },
    recent: rows
      .filter((r) => r.text?.trim())
      .slice(0, 3)
      .map((r) => ({
        rating: r.rating,
        text: r.text,
        date: r.created_at,
        by: (Array.isArray(r.client) ? r.client[0]?.full_name : r.client?.full_name) ?? null,
      })),
  });
}
