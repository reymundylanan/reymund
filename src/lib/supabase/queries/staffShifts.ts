import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffOffPeriod = "full_day" | "morning" | "afternoon";

export type StaffOffRecord = {
  id: string;
  staff_member_id: string;
  branch_id: string;
  shift_date: string;
  period: StaffOffPeriod;
};

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}

export async function getStaffShiftsForDate(
  supabase: SupabaseClient,
  branchId: string,
  dateKey: string
): Promise<StaffOffRecord[]> {
  const { data, error } = await supabase
    .from("staff_shifts")
    .select("id, staff_member_id, branch_id, shift_date, period")
    .eq("branch_id", branchId)
    .eq("shift_date", dateKey);

  if (error) {
    console.error("getStaffShiftsForDate failed:", error);
    return [];
  }
  return (data as StaffOffRecord[]) ?? [];
}

export async function getStaffShiftsForRange(
  supabase: SupabaseClient,
  staffMemberId: string,
  startKey: string,
  endKey: string
): Promise<StaffOffRecord[]> {
  const { data, error } = await supabase
    .from("staff_shifts")
    .select("id, staff_member_id, branch_id, shift_date, period")
    .eq("staff_member_id", staffMemberId)
    .gte("shift_date", startKey)
    .lte("shift_date", endKey);

  if (error) {
    console.error("getStaffShiftsForRange failed:", error);
    return [];
  }
  return (data as StaffOffRecord[]) ?? [];
}

export async function upsertStaffOff(
  supabase: SupabaseClient,
  input: { staffMemberId: string; branchId: string; shiftDate: string; period: StaffOffPeriod }
): Promise<{ error: string | null }> {
  const { error: deleteError } = await supabase
    .from("staff_shifts")
    .delete()
    .eq("staff_member_id", input.staffMemberId)
    .eq("shift_date", input.shiftDate);

  if (deleteError) return { error: deleteError.message };

  const { error: insertError } = await supabase.from("staff_shifts").insert({
    staff_member_id: input.staffMemberId,
    branch_id: input.branchId,
    shift_date: input.shiftDate,
    period: input.period,
  });

  if (insertError) return { error: insertError.message };
  return { error: null };
}

export async function removeStaffOff(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("staff_shifts").delete().eq("id", id);
  return { error: error?.message ?? null };
}
