import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/multiBranch/server";
import { hairPriceMap } from "@/lib/multiBranch/load";
import { parseDuration } from "@/lib/multiBranch/engine";

/** Every active service across all branches (by name), so a walk-in can ask
 * for one this branch doesn't offer. */
export async function GET() {
  const gate = await requireDesk();
  if ("error" in gate) return gate.error;
  const [{ data: rows }, { data: branches }] = await Promise.all([
    gate.admin.from("branch_services").select("branch_id, name, department, category, duration, price, hair_options").eq("status", "Active"),
    gate.admin.from("branches").select("id, name"),
  ]);
  const branchName = new Map(((branches ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  type Row = { branch_id: string; name: string; department: string | null; category: string | null; duration: string | null; price: number | null; hair_options: { prices?: Record<string, string | number | null> } | null };
  const byName = new Map<string, { name: string; department: string; category: string; duration: number; sizes: string[]; branches: { branchId: string; branchName: string; price: number }[] }>();
  for (const r of (rows ?? []) as Row[]) {
    const key = r.name.toLowerCase();
    const item = byName.get(key) ?? { name: r.name, department: r.department ?? "", category: r.category ?? "", duration: parseDuration(r.duration), sizes: [], branches: [] };
    const sizes = hairPriceMap(r.hair_options);
    if (sizes) item.sizes = [...new Set([...item.sizes, ...Object.keys(sizes)])];
    if (!item.branches.some((b) => b.branchId === r.branch_id)) item.branches.push({ branchId: r.branch_id, branchName: branchName.get(r.branch_id) ?? "—", price: Number(r.price ?? 0) });
    byName.set(key, item);
  }
  return NextResponse.json({
    services: [...byName.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    branchId: gate.branchId,
  });
}
