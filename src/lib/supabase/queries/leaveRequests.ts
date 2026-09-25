import type { SupabaseClient } from "@supabase/supabase-js";

export type LeaveRequestStatus = "pending" | "approved" | "denied";

export type LeaveRequest = {
  id: string;
  staff_member_id: string;
  branch_id: string;
  dates: string[];
  reason: string | null;
  status: LeaveRequestStatus;
  created_at: string;
  decided_at: string | null;
  staff_member: { full_name: string; department: string | null } | null;
};

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function getLeaveRequestsForBranch(
  supabase: SupabaseClient,
  branchId: string
): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select(
      "id, staff_member_id, branch_id, dates, reason, status, created_at, decided_at, staff_member:staff_members(full_name, department)"
    )
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getLeaveRequestsForBranch failed:", error);
    return [];
  }

  type Row = Omit<LeaveRequest, "staff_member"> & {
    staff_member: Rel<{ full_name: string; department: string | null }>;
  };
  return ((data as unknown as Row[]) ?? []).map((row) => ({
    ...row,
    staff_member: one(row.staff_member),
  }));
}

export async function submitLeaveRequest(
  supabase: SupabaseClient,
  input: { staffMemberId: string; branchId: string; dates: string[]; reason: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("leave_requests").insert({
    staff_member_id: input.staffMemberId,
    branch_id: input.branchId,
    dates: input.dates,
    reason: input.reason || null,
    status: "pending",
  });

  return { error: error?.message ?? null };
}
