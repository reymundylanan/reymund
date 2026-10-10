import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTime } from "./engine";
import { loadContext, manilaNow } from "./load";
import { findWalkinOptions, walkinTransferStatus, type WalkinOption, type WalkinRequest, type WalkinService } from "./walkin";

export type WalkinSearchBody = {
  originBranchId?: string;
  services: WalkinService[];
  duration: number;
  preferredStaffId?: string | null;
  date?: string;
  time?: string | null;
  days?: number;
};

export type OptionView = WalkinOption & { branchName: string; address: string | null; phone: string | null; staffName: string; label: string };

/** Runs the search on live data and adds what the desk needs to show the client. */
export async function searchWalkin(admin: SupabaseClient, originBranchId: string, body: WalkinSearchBody) {
  const ctx = await loadContext(admin, { date: body.date, days: Math.min(Math.max(body.days ?? 3, 1), 7) + 1 });
  const fromMinutes = body.time && /^\d{2}:\d{2}/.test(body.time) ? Number(body.time.slice(0, 2)) * 60 + Number(body.time.slice(3, 5)) : null;
  const req: WalkinRequest = {
    originBranchId,
    services: body.services ?? [],
    duration: Math.max(5, Math.round(body.duration || 60)),
    preferredStaffId: body.preferredStaffId ?? null,
    date: body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : ctx.today,
    fromMinutes,
    days: Math.min(Math.max(body.days ?? 3, 1), 7),
  };
  const result = findWalkinOptions(ctx, req);
  const view = (o: WalkinOption): OptionView => {
    const b = ctx.branches.find((x) => x.id === o.branchId);
    const s = ctx.staff.find((x) => x.id === o.staffId);
    return {
      ...o,
      branchName: b?.name ?? "—",
      address: b?.address ?? null,
      phone: b?.phone ?? null,
      staffName: s?.name ?? "—",
      label: `${b?.name ?? "—"} · ${formatTime(o.start)} · ${s?.name ?? "—"}`,
    };
  };
  return {
    ctx,
    today: ctx.today,
    origin: result.origin,
    branches: result.branches.map((c) => ({ ...c, branchName: ctx.branches.find((b) => b.id === c.branchId)?.name ?? "—" })),
    options: result.options.map(view),
  };
}

export type WalkinTransferRecord = {
  id: string;
  status: "waiting_availability" | "awaiting_approval" | "confirmed" | "cancelled";
  origin_branch_id: string;
  dest_branch_id: string | null;
  client_id: string | null;
  walkin_name: string;
  walkin_phone: string | null;
  services: { name?: string; service_id?: string; price?: number }[];
  duration_minutes: number;
  origin_price: number | null;
  price: number | null;
  requested_date: string;
  requested_time: string | null;
  professional_id: string | null;
  proposed_date: string | null;
  proposed_time: string | null;
  mode: "immediate" | "later" | null;
  travel_minutes: number | null;
  dest_appointment_id: string | null;
  notes: string | null;
  cancel_reason: string | null;
  initiated_by: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type WalkinTransferItem = WalkinTransferRecord & {
  state: ReturnType<typeof walkinTransferStatus>;
  bookingCode: string | null;
  originName: string;
  destName: string | null;
  destAddress: string | null;
  staffName: string | null;
  initiatedByName: string | null;
};

/** Walk-in transfers (newest first) with names and their live status. */
export async function loadWalkinTransfers(
  admin: SupabaseClient,
  opts: { days?: number; branchId?: string | null } = {}
): Promise<{ items: WalkinTransferItem[]; error: { message?: string; code?: string } | null }> {
  const since = new Date(Date.now() - (opts.days ?? 14) * 86400000).toISOString();
  let q = admin.from("walkin_transfers").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(300);
  if (opts.branchId) q = q.or(`origin_branch_id.eq.${opts.branchId},dest_branch_id.eq.${opts.branchId}`);
  const { data, error } = await q;
  if (error) return { items: [], error };
  const rows = (data ?? []) as WalkinTransferRecord[];

  const apptIds = rows.map((x) => x.dest_appointment_id).filter((x): x is string => !!x);
  const staffIds = rows.map((x) => x.professional_id).filter((x): x is string => !!x);
  const userIds = rows.map((x) => x.initiated_by).filter((x): x is string => !!x);
  const [appts, branches, staff, users] = await Promise.all([
    apptIds.length ? admin.from("appointments").select("id, status, session_status, booking_code").in("id", apptIds) : Promise.resolve({ data: [] }),
    admin.from("branches").select("id, name, address"),
    staffIds.length ? admin.from("staff_members").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const apptOf = new Map(((appts.data ?? []) as { id: string; status: string; session_status: string | null; booking_code: string | null }[]).map((a) => [a.id, a]));
  const branchOf = new Map(((branches.data ?? []) as { id: string; name: string; address: string | null }[]).map((b) => [b.id, b]));
  const staffOf = new Map(((staff.data ?? []) as { id: string; full_name: string }[]).map((s) => [s.id, s.full_name]));
  const userOf = new Map(((users.data ?? []) as { id: string; full_name: string | null }[]).map((u) => [u.id, u.full_name ?? "Staff"]));
  const { today } = manilaNow();

  return {
    error: null,
    items: rows.map((x) => {
      const appt = x.dest_appointment_id ? apptOf.get(x.dest_appointment_id) ?? null : null;
      return {
        ...x,
        state: walkinTransferStatus(x, appt, today),
        bookingCode: appt?.booking_code ?? null,
        originName: branchOf.get(x.origin_branch_id)?.name ?? "—",
        destName: x.dest_branch_id ? branchOf.get(x.dest_branch_id)?.name ?? "—" : null,
        destAddress: x.dest_branch_id ? branchOf.get(x.dest_branch_id)?.address ?? null : null,
        staffName: x.professional_id ? staffOf.get(x.professional_id) ?? null : null,
        initiatedByName: x.initiated_by ? userOf.get(x.initiated_by) ?? "Staff" : null,
      };
    }),
  };
}
