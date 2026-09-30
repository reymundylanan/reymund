"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  PAGE_SIZE,
  getAdminReviewStats,
  listAdminReviews,
  type AdminReviewRow,
  type ReviewFilters,
} from "@/lib/supabase/queries/adminReviews";
import ReviewDetailPanel from "./ReviewDetailPanel";

type Stats = Awaited<ReturnType<typeof getAdminReviewStats>>;
type Options = { staff: { id: string; name: string }[]; branches: { id: string; name: string }[]; services: { id: string; name: string }[] };

const TYPE_LABEL = { service: "Service", staff: "Staff", branch: "Branch" } as const;
const STATUS_STYLE = {
  visible: "bg-green-100 text-green-700",
  flagged: "bg-amber-100 text-amber-700",
  hidden: "bg-amber-100 text-amber-700",
  removed: "bg-red-100 text-red-600",
} as const;

const STATUS_TABS: { label: string; status: ReviewFilters["status"] }[] = [
  { label: "All", status: undefined },
  { label: "Flagged", status: "flagged" },
  { label: "Visible", status: "visible" },
  { label: "Hidden", status: "hidden" },
  { label: "Removed", status: "removed" },
];

function toQuery(f: ReviewFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== "" && v !== false && !(k === "page" && v === 1)) p.set(k, v === true ? "1" : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default function ReviewsManager({
  initialFilters,
  initialList,
  initialStats,
  options,
}: {
  initialFilters: ReviewFilters;
  initialList: { rows: AdminReviewRow[]; total: number };
  initialStats: Stats;
  options: Options;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [list, setList] = useState(initialList);
  const [stats, setStats] = useState(initialStats);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState(initialFilters.q ?? "");

  const filtersRef = useRef(filters);
  const requestRef = useRef(0);

  const reload = useCallback(async (f: ReviewFilters) => {
    const id = ++requestRef.current;
    try {
      const supabase = createClient();
      const [l, s] = await Promise.all([listAdminReviews(supabase, f), getAdminReviewStats(supabase)]);
      if (id !== requestRef.current) return;
      setList(l);
      setStats(s);
    } catch (e) {
      console.error("reload reviews failed:", e);
    }
  }, []);

  function apply(next: ReviewFilters) {
    const f = { ...next, page: next.page ?? 1 };
    filtersRef.current = f;
    setFilters(f);
    router.replace(`${pathname}${toQuery(f)}`, { scroll: false });
    reload(f);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-reviews-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews" }, () => reload(filtersRef.current))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const select = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href="/admin/reviews/rewards" className="rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
          Rewards
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {(["service", "staff", "branch"] as const).map((t) => (
          <div key={t} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-ink/40">{TYPE_LABEL[t]}</p>
            <p className="mt-1 flex items-center gap-1 text-xl font-semibold text-ink">
              <Star className="h-4 w-4 fill-gold text-gold" /> {stats.byType[t].average}
            </p>
            <p className="text-xs text-ink/40">{stats.byType[t].count} visible</p>
          </div>
        ))}
        <button onClick={() => apply({ ...filters, page: undefined, status: "new" })} className="rounded-2xl bg-white p-4 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink/40">New</p>
          <p className="mt-1 text-xl font-semibold text-coral-dark">{stats.newCount}</p>
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex gap-4 border-b border-ink/10 text-sm font-medium">
          {([undefined, "service", "staff", "branch"] as const).map((t) => (
            <button
              key={t ?? "all"}
              onClick={() => apply({ ...filters, page: undefined, type: t })}
              className={`pb-2 ${filters.type === t ? "border-b-2 border-coral text-coral-dark" : "text-ink/50"}`}
            >
              {t ? TYPE_LABEL[t] : "All"}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium">
          {STATUS_TABS.map((t) => {
            const active = filters.status === t.status;
            const count =
              t.status === "flagged" ? stats.flaggedCount : t.status === "hidden" ? stats.hiddenCount : t.status === "removed" ? stats.removedCount : null;
            return (
              <button
                key={t.label}
                onClick={() => apply({ ...filters, page: undefined, status: t.status })}
                className={`rounded-full px-3 py-1 ${
                  active
                    ? t.status === "flagged"
                      ? "bg-amber-500 text-white"
                      : "bg-coral text-white"
                    : t.status === "flagged"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-blush text-ink/60"
                }`}
              >
                {t.label}
                {count !== null && ` (${count})`}
              </button>
            );
          })}
          <label className="ml-2 flex items-center gap-1.5 text-ink/70">
            <input
              type="checkbox"
              checked={!!filters.photos}
              onChange={(e) => apply({ ...filters, page: undefined, photos: e.target.checked ? true : undefined })}
            />
            With photos
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <select className={select} value={filters.service ?? ""} onChange={(e) => apply({ ...filters, page: undefined, service: e.target.value || undefined })}>
            <option value="">All services</option>
            {options.services.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={select} value={filters.staff ?? ""} onChange={(e) => apply({ ...filters, page: undefined, staff: e.target.value || undefined })}>
            <option value="">All staff</option>
            {options.staff.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={select} value={filters.branch ?? ""} onChange={(e) => apply({ ...filters, page: undefined, branch: e.target.value || undefined })}>
            <option value="">All branches</option>
            {options.branches.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={select} value={filters.rating ?? ""} onChange={(e) => apply({ ...filters, page: undefined, rating: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Any rating</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
          </select>
          <select className={select} value={filters.status ?? ""} onChange={(e) => apply({ ...filters, page: undefined, status: (e.target.value || undefined) as ReviewFilters["status"] })}>
            <option value="">Any status</option>
            <option value="new">New</option>
            <option value="flagged">Flagged</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
            <option value="removed">Removed</option>
          </select>
          <input type="date" className={select} value={filters.from ?? ""} onChange={(e) => apply({ ...filters, page: undefined, from: e.target.value || undefined })} />
          <input type="date" className={select} value={filters.to ?? ""} onChange={(e) => apply({ ...filters, page: undefined, to: e.target.value || undefined })} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply({ ...filters, page: undefined, q: search.trim() || undefined });
            }}
          >
            <input className={select} placeholder="Search comments or client name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <button onClick={() => { setSearch(""); apply({}); }} className="text-sm text-ink/50 hover:text-ink">
            Clear
          </button>
        </div>

        <div className="mt-4 divide-y divide-ink/5">
          {list.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink/40">No reviews match these filters.</p>
          ) : (
            list.rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className={`flex w-full items-start gap-3 py-3 text-left hover:bg-blush/40 ${r.isNew ? "bg-amber-50/60" : ""}`}
              >
                <span className="w-16 shrink-0 text-sm text-gold">{"★".repeat(r.rating)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    <span className="mr-1.5 rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold text-coral-dark">{TYPE_LABEL[r.targetType]}</span>
                    {r.targetName}
                    {r.isNew && <span className="ml-2 text-[11px] font-semibold uppercase text-amber-600">New</span>}
                  </p>
                  {r.text && <p className="mt-0.5 truncate text-sm text-ink/60">{r.text}</p>}
                  {(r.photoCount > 0 || r.reportCount > 0) && (
                    <p className="mt-0.5 flex gap-3 text-xs font-medium">
                      {r.photoCount > 0 && <span className="text-ink/60">📷 {r.photoCount}</span>}
                      {r.reportCount > 0 && (
                        <span className="text-amber-700">
                          ⚑ {r.reportCount} {r.reportCount === 1 ? "report" : "reports"}
                        </span>
                      )}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-ink/40">
                    {r.clientName} · {new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" })}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </button>
            ))
          )}
        </div>

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <button disabled={(filters.page ?? 1) <= 1} onClick={() => apply({ ...filters, page: (filters.page ?? 1) - 1 })} className="rounded-full border border-ink/15 px-3 py-1 disabled:opacity-40">
              Previous
            </button>
            <span className="text-ink/50">Page {filters.page ?? 1} of {pages}</span>
            <button disabled={(filters.page ?? 1) >= pages} onClick={() => apply({ ...filters, page: (filters.page ?? 1) + 1 })} className="rounded-full border border-ink/15 px-3 py-1 disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </div>

      {openId && (
        <ReviewDetailPanel
          reviewId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => reload(filtersRef.current)}
        />
      )}
    </div>
  );
}
