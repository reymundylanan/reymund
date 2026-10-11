import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { getReviewHighlights, type ReviewStats } from "@/lib/supabase/queries/publicContent";
import { summarizeServices, type DepartmentSummary, type ServiceRow } from "@/lib/homeSummary";

export type HomeBranch = { name: string; hours: string | null; address: string | null };

export type HomeOverview = {
  branches: HomeBranch[];
  departments: DepartmentSummary[];
  treatments: number;
  specialists: number;
  reviews: ReviewStats;
};

/** Live facts shown across the home page (hero card, services, closing
 * banner) — read once per request. Anything missing just stays out. */
export const getHomeOverview = cache(async (supabase: SupabaseClient): Promise<HomeOverview> => {
  const [branches, services, staff, { stats }] = await Promise.all([
    supabase.from("branches").select("name, hours, address").order("name"),
    supabase.from("branch_services").select("name, category, department, price").eq("status", "Active"),
    supabase.from("public_staff_profiles").select("id", { count: "exact", head: true }),
    getReviewHighlights(supabase, 0),
  ]);
  logQueryError("getHomeOverview branches", branches.error);
  logQueryError("getHomeOverview services", services.error);
  logQueryError("getHomeOverview staff", staff.error);

  const departments = summarizeServices((services.data ?? []) as ServiceRow[]);
  return {
    branches: (branches.data ?? []) as HomeBranch[],
    departments,
    treatments: departments.reduce((s, d) => s + d.treatments, 0),
    specialists: staff.count ?? 0,
    reviews: stats,
  };
});
