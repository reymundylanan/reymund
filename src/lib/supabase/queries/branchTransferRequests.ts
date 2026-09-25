import type { SupabaseClient } from "@supabase/supabase-js";

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function createApprovedTransfer(
  supabase: SupabaseClient,
  input: { staffMemberId: string; targetBranchId: string; dates: string[]; reason: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("branch_transfer_requests").insert({
    staff_member_id: input.staffMemberId,
    target_branch_id: input.targetBranchId,
    dates: input.dates,
    reason: input.reason || null,
    status: "approved",
    decided_at: new Date().toISOString(),
  });

  return { error: error?.message ?? null };
}

export async function getApprovedTransferDatesForBranch(
  supabase: SupabaseClient,
  staffMemberId: string,
  targetBranchId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("branch_transfer_requests")
    .select("dates")
    .eq("staff_member_id", staffMemberId)
    .eq("target_branch_id", targetBranchId)
    .eq("status", "approved");

  if (error) {
    console.error("getApprovedTransferDatesForBranch failed:", error);
    return [];
  }

  const rows = (data as { dates: string[] }[]) ?? [];
  return Array.from(new Set(rows.flatMap((r) => r.dates))).sort();
}

export async function getUpcomingApprovedTransfers(
  supabase: SupabaseClient
): Promise<{ staff_member_id: string; dates: string[]; branch_name: string }[]> {
  const { data, error } = await supabase
    .from("branch_transfer_requests")
    .select("staff_member_id, dates, branch:branches!target_branch_id(name)")
    .eq("status", "approved");

  if (error) {
    console.error("getUpcomingApprovedTransfers failed:", error);
    return [];
  }

  type Row = { staff_member_id: string; dates: string[]; branch: Rel<{ name: string }> };
  return ((data as unknown as Row[]) ?? []).map((row) => ({
    staff_member_id: row.staff_member_id,
    dates: row.dates,
    branch_name: one(row.branch)?.name ?? "another branch",
  }));
}

export async function getUpcomingTransfersIntoBranch(
  supabase: SupabaseClient,
  targetBranchId: string
): Promise<{ staff_member_id: string; full_name: string; department: string | null; dates: string[] }[]> {
  const { data, error } = await supabase
    .from("branch_transfer_requests")
    .select("staff_member_id, dates, staff_member:staff_members(full_name, department)")
    .eq("target_branch_id", targetBranchId)
    .eq("status", "approved");

  if (error) {
    console.error("getUpcomingTransfersIntoBranch failed:", error);
    return [];
  }

  type Row = {
    staff_member_id: string;
    dates: string[];
    staff_member: Rel<{ full_name: string; department: string | null }>;
  };
  return ((data as unknown as Row[]) ?? []).map((row) => ({
    staff_member_id: row.staff_member_id,
    dates: row.dates,
    department: one(row.staff_member)?.department ?? null,
    full_name: one(row.staff_member)?.full_name ?? "A staff member",
  }));
}

export async function getUpcomingTransfersFromBranch(
  supabase: SupabaseClient,
  homeBranchId: string
): Promise<{ staff_member_id: string; full_name: string; dates: string[]; target_branch_name: string }[]> {
  const { data, error } = await supabase
    .from("branch_transfer_requests")
    .select(
      "staff_member_id, dates, branch:branches!target_branch_id(name), staff_member:staff_members!inner(full_name, branch_id)"
    )
    .eq("status", "approved")
    .eq("staff_member.branch_id", homeBranchId);

  if (error) {
    console.error("getUpcomingTransfersFromBranch failed:", error);
    return [];
  }

  type Row = {
    staff_member_id: string;
    dates: string[];
    branch: Rel<{ name: string }>;
    staff_member: Rel<{ full_name: string; branch_id: string | null }>;
  };
  return ((data as unknown as Row[]) ?? []).map((row) => ({
    staff_member_id: row.staff_member_id,
    dates: row.dates,
    full_name: one(row.staff_member)?.full_name ?? "A staff member",
    target_branch_name: one(row.branch)?.name ?? "another branch",
  }));
}

export type TransferredInStaff = {
  staffMemberId: string;
  fullName: string;
  department: string | null;
  phone: string | null;
  avatarUrl: string | null;
};

export async function getStaffTransferredIntoBranch(
  supabase: SupabaseClient,
  targetBranchId: string
): Promise<TransferredInStaff[]> {
  const { data, error } = await supabase
    .from("branch_transfer_requests")
    .select(
      "staff_member_id, dates, staff_member:staff_members(full_name, department, phone, avatar_url)"
    )
    .eq("target_branch_id", targetBranchId)
    .eq("status", "approved");

  if (error) {
    console.error("getStaffTransferredIntoBranch failed:", error);
    return [];
  }

  type Row = {
    staff_member_id: string;
    dates: string[];
    staff_member: Rel<{ full_name: string; department: string | null; phone: string | null; avatar_url: string | null }>;
  };
  const todayKey = new Date().toISOString().slice(0, 10);
  const rows = ((data as unknown as Row[]) ?? []).filter((row) => row.dates.some((d) => d >= todayKey));
  const seen = new Map<string, TransferredInStaff>();
  for (const row of rows) {
    const sm = one(row.staff_member);
    if (sm && !seen.has(row.staff_member_id)) {
      seen.set(row.staff_member_id, {
        staffMemberId: row.staff_member_id,
        fullName: sm.full_name,
        department: sm.department,
        phone: sm.phone,
        avatarUrl: sm.avatar_url,
      });
    }
  }
  return Array.from(seen.values());
}
