"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Clock, UserRound } from "lucide-react";
import BranchesToolbar from "@/components/admin/branches/BranchesToolbar";
import BranchDetailView from "@/components/admin/branches/BranchDetailView";
import AddBranchModal from "@/components/admin/branches/AddBranchModal";
import { adminBranches } from "@/lib/adminData";
import { createClient } from "@/lib/supabase/client";

type Branch = (typeof adminBranches)[number];
type BranchRow = {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  phone: string | null;
  hours: string | null;
  status: string | null;
  image_url: string | null;
  facebook: string | null;
  facebook_label: string | null;
  instagram: string | null;
  instagram_label: string | null;
};

const FALLBACK_IMAGE = "/images/hero/clinic.jpeg";
const STATUS_LABEL: Record<string, string> = { active: "Active", inactive: "Inactive", maintenance: "Maintenance", closed: "Closed" };

/** A database branch in the shape the branch pages use; the built-in
 * details (social links, phone) fill any gaps for the original two. */
function toBranch(r: BranchRow): Branch {
  const known = adminBranches.find((b) => b.name === r.name);
  const status = (r.status ?? "active").toLowerCase();
  return {
    id: r.id,
    name: r.name,
    address: r.address ?? known?.address ?? "",
    region: r.region || known?.region || "Other",
    manager: known?.manager ?? "",
    hours: r.hours || known?.hours || "",
    status: STATUS_LABEL[status] ?? status.charAt(0).toUpperCase() + status.slice(1),
    image: r.image_url || known?.image || FALLBACK_IMAGE,
    phone: r.phone ?? known?.phone ?? "",
    facebook: r.facebook ?? known?.facebook ?? "",
    facebookLabel: r.facebook_label ?? known?.facebookLabel ?? "",
    instagram: r.instagram ?? known?.instagram ?? "",
    instagramLabel: r.instagram_label ?? known?.instagramLabel ?? "",
  };
}

function parseTime12h(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const p = m[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function isOpenNow(hours: string, now: Date): boolean {
  const parts = hours.split(" - ");
  if (parts.length !== 2) return false;
  const open = parseTime12h(parts[0]);
  const close = parseTime12h(parts[1]);
  if (open == null || close == null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= open && cur < close;
}

export default function BranchesManager() {
  const [region, setRegion] = useState("All Regions");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Branch | null>(null);
  // Every branch in the database (the built-in list only until it loads).
  const [branches, setBranches] = useState<Branch[]>(adminBranches);
  const [adding, setAdding] = useState(false);
  // Photos that failed to load show the spa photo instead of an empty box.
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [cardPositions, setCardPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("branches")
      .select("id, name, address, region, phone, hours, status, image_url, facebook, facebook_label, instagram, instagram_label")
      .order("created_at")
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadFailed(!!error);
        if (error || !data?.length) return;
        setBranches((data as BranchRow[]).map(toBranch));
      });

    const pos: Record<string, { x: number; y: number }> = {};
    for (const b of branches) {
      try {
        const stored = localStorage.getItem(`branch_pos_${b.name}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          pos[b.name] = { x: parsed.cardPosX ?? 50, y: parsed.cardPosY ?? 50 };
        }
      } catch {}
    }
    setCardPositions(pos);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on refresh only
  }, [refreshKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    return branches.filter((b) => {
      const matchesRegion = region === "All Regions" || b.region === region;
      const matchesQuery = query.trim()
        ? b.name.toLowerCase().includes(query.toLowerCase()) ||
          b.address.toLowerCase().includes(query.toLowerCase()) ||
          b.manager.toLowerCase().includes(query.toLowerCase())
        : true;
      return matchesRegion && matchesQuery;
    });
  }, [branches, region, query]);

  const regions = useMemo(() => [...new Set(branches.map((b) => b.region).filter(Boolean))].sort(), [branches]);

  if (selected) {
    return <BranchDetailView branch={selected} onBack={() => { setSelected(null); setRefreshKey((k) => k + 1); }} />;
  }

  return (
    <div className="space-y-6">
      {notice && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-[#E6EDE2] px-4 py-3 text-sm text-[#4F6B4A]">
          {notice}
          <button onClick={() => setNotice(null)} className="font-semibold hover:underline">Dismiss</button>
        </p>
      )}
      {loadFailed && (
        <p role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-[#F9E8D9] px-4 py-3 text-sm text-[#94602F]">
          Couldn&apos;t load the latest branches — showing the saved list. New branches may be missing.
          <button onClick={() => setRefreshKey((k) => k + 1)} className="shrink-0 font-semibold hover:underline">Try again</button>
        </p>
      )}
      <BranchesToolbar
        regions={[{ label: "All Regions", count: branches.length }, ...regions.map((r) => ({ label: r, count: branches.filter((b) => b.region === r).length }))]}
        onAdd={() => setAdding(true)}
        region={region}
        onRegionChange={setRegion}
        query={query}
        onQueryChange={setQuery}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        {filtered.map((branch) => (
          <div key={branch.id} className="group overflow-hidden rounded-3xl bg-white shadow-[0_14px_34px_-26px_rgba(90,60,20,0.55)] ring-1 ring-[#efe3c6] transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="relative h-44 overflow-hidden bg-[#f8efd9]">
              <Image
                src={brokenImages.has(branch.name) ? FALLBACK_IMAGE : branch.image}
                onError={() => setBrokenImages((s) => new Set(s).add(branch.name))}
                alt={branch.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                style={{ objectPosition: `${cardPositions[branch.name]?.x ?? 50}% ${cardPositions[branch.name]?.y ?? 50}%` }}
                sizes="(max-width: 640px) 100vw, 50vw"
              />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink">{branch.name}</h3>
                {branch.status === "Active" ? (
                  isOpenNow(branch.hours, now) ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">Open</span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">Closed</span>
                  )
                ) : (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    branch.status === "Maintenance" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                  }`}>
                    {branch.status}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink/60">{branch.address}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink/60">
                <span className="flex items-center gap-1 rounded-full bg-cream px-2.5 py-1"><Clock className="h-3.5 w-3.5 text-coral-dark" /> {branch.hours}</span>
                <span className="flex items-center gap-1 rounded-full bg-cream px-2.5 py-1"><UserRound className="h-3.5 w-3.5 text-coral-dark" /> Manager: {branch.manager || "not set"}</span>
              </div>
              <button
                onClick={() => setSelected(branch)}
                className="mt-4 w-full rounded-full border border-coral/50 bg-[#fffaf0] px-4 py-2.5 text-sm font-semibold text-coral-dark transition hover:bg-coral hover:text-white"
              >
                Manage Branch
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="col-span-2 py-10 text-center text-ink/40">
            No branches match this filter.
          </p>
        )}
      </div>

      {adding && (
        <AddBranchModal
          existingNames={branches.map((b) => b.name)}
          regions={regions}
          onClose={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setRegion("All Regions");
            setNotice(`${name} was added. Open Manage Branch to add its services, staff and photo.`);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
