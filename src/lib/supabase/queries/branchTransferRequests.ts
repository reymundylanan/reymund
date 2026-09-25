import type { SupabaseClient } from "@supabase/supabase-js";

export type BranchTransferStatus = "pending" | "approved" | "denied";

export type BranchTransferRequest = {
  id: string;
  staff_member_id: string;
  target_branch_id: string;
  dates: string[];
  reason: string | null;
  status: BranchTransferStatus;
  created_at: string;
  decided_at: string | null;
  staff_member: { full_name: string; department: string | null; branch: { name: string } | null } | null;
};

export type OtherBranchStaff = {
  id: string;
  full_name: string;
  department: string | null;
  branch_name: string;
};

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function getOtherBranchStaff(
  supabase: SupabaseClient,
  excludeBranchId: string
): Promise<OtherBranchStaff[]> {
  const { data, error } = await supabase
    .from("staff_members")
    .select("id, full_name, department, branch:branches(name)")
    .neq("branch_id", excludeBranchId)
    .order("full_name");

  if (error) {
    console.error("getOtherBranchStaff failed:", error);
    return [];
  }

  type Row = { id: string; full_name: string; department: string | null; branch: Rel<{ name: string }> };
  return ((data as unknown as Row[]) ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    department: row.department,
    branch_name: one(row.branch)?.name ?? "Unknown branch",
  }));
}

export async function getBranchTransferRequestsForBranch(
  supabase: SupabaseClient,
  targetBranchId: string
): Promise<BranchTransferRequest[]> {
  const { data, error } = await supabase
    .from("branch_transfer_requests")
    .select(
      "id, staff_member_id, target_branch_id, dates, reason, status, created_at, decided_at, staff_member:staff_members(full_name, department, branch:branches(name))"
    )
    .eq("target_branch_id", targetBranchId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getBranchTransferRequestsForBranch failed:", error);
    return [];
  }

  type Row = Omit<BranchTransferRequest, "staff_member"> & {
    staff_member: Rel<{ full_name: string; department: string | null; branch: Rel<{ name: string }> }>;
  };
  return ((data as unknown as Row[]) ?? []).map((row) => {
    const sm = one(row.staff_member);
    return {
      ...row,
      staff_member: sm ? { full_name: sm.full_name, department: sm.department, branch: one(sm.branch) } : null,
    };
  });
}

export async function submitBranchTransferRequest(
  supabase: SupabaseClient,
  input: { staffMemberId: string; targetBranchId: string; dates: string[]; reason: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("branch_transfer_requests").insert({
    staff_member_id: input.staffMemberId,
    target_branch_id: input.targetBranchId,
    dates: input.dates,
    reason: input.reason || null,
    status: "pending",
  });

  return { error: error?.message ?? null };
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
