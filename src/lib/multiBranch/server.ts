import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNotMigratedError } from "@/lib/supabase/logQueryError";

/** Admin-only gate for every Multi-Branch API route (UI hiding is not enough).
 * Returns the caller's session client (for the RPCs, which check again) and a
 * service-role client for reads RLS would hide (deliveries, Messenger links). */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Only Admins can use Multi-Branch." }, { status: 403 }) } as const;
  }
  return { supabase, admin: createAdminClient(), userId: auth.user.id } as const;
}

export type RpcFailure = { code: string; message: string; status: number };

/** Turns a database error into a readable, actionable one. */
export function rpcFailure(error: { message?: string; code?: string } | null): RpcFailure {
  if (isNotMigratedError(error)) {
    return { code: "NOT_MIGRATED", message: "Multi-Branch needs database migration 075 — apply it in Supabase first.", status: 503 };
  }
  const m = (error?.message ?? "").match(/MB_REJECTED:([A-Z_]+):([\s\S]*)$/);
  if (m) return { code: m[1], message: m[2].trim().replace(/\.?$/, "."), status: m[1] === "FORBIDDEN" ? 403 : 409 };
  return { code: "ERROR", message: error?.message ?? "Something went wrong.", status: 500 };
}

export function fail(f: RpcFailure, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: f.message, code: f.code, ...extra }, { status: f.status });
}

/** Admin, or a Front Desk user (with their branch) — for walk-in transfers,
 * which the Front Desk starts from its own branch. The database checks again. */
export async function requireDesk() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const { data: profile } = await supabase.from("profiles").select("role, branch_id").eq("id", auth.user.id).single();
  const role = profile?.role as string | undefined;
  if (role !== "admin" && role !== "front_desk") {
    return { error: NextResponse.json({ error: "Only Front Desk or Admin can transfer walk-ins." }, { status: 403 }) } as const;
  }
  if (role === "front_desk" && !profile?.branch_id) {
    return { error: NextResponse.json({ error: "This Front Desk account has no branch assigned." }, { status: 403 }) } as const;
  }
  return { supabase, admin: createAdminClient(), userId: auth.user.id, role, branchId: (profile?.branch_id as string | null) ?? null } as const;
}
