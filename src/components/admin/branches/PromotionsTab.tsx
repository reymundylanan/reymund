"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Plus, Tag, Trash2, X } from "lucide-react";

type Promotion = {
  id: string;
  branch_id: string;
  title: string;
  department: string | null;
  category: string | null;
  price: number | null;
  price_medium: number | null;
  price_long: number | null;
  description: string | null;
  badge: string | null;
  discount_type: "percent" | "fixed" | "bogo" | "custom" | null;
  discount_value: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
};

const DEPARTMENTS = ["Nails", "Hair", "Clinic"];

const CATEGORIES = [
  "Doctor's Procedure",
  "Non-Surgical Liposuction",
  "Slimming Services",
  "Cocktail Drips",
  "Laser Services",
  "Premium Treatments",
  "Facial Services",
  "Body & Wellness",
  "Brows & Lashes",
  "Nail Care",
  "Hair Services",
];

const SPA_INCLUSIONS = [
  "Good for five (5) pax",
  "Good for ten (10) pax",
  "Good for fifteen (15) pax",
  "₱ 5,000 worth consumable spa services",
  "₱ 6,000 worth consumable spa services",
  "₱ 7,000 worth consumable spa services",
  "₱ 8,000 worth consumable spa services",
  "₱ 10,000 worth consumable spa services",
  "2 hours exclusive use of spa area",
  "3 hours exclusive use of spa area",
  "4 hours exclusive use of spa area",
  "Balloon Decoration (backdrop)",
  "Cupcakes and one (1) bottle of wine",
  "Complimentary drinks",
  "Free birthday cake",
  "Sound system",
];

const SPA_TIER_DEFAULTS: Record<string, string[]> = {
  BASIC: [
    "Good for ten (10) pax",
    "₱ 6,000 worth consumable spa services",
    "3 hours exclusive use of spa area",
  ],
  PREMIUM: [
    "Good for ten (10) pax",
    "₱ 7,000 worth consumable spa services",
    "3 hours exclusive use of spa area",
    "Balloon Decoration (backdrop)",
    "Cupcakes and one (1) bottle of wine",
  ],
};

const DISCOUNT_TYPES = [
  { value: "percent", label: "% Off" },
  { value: "fixed", label: "₱ Off" },
  { value: "bogo", label: "BOGO" },
  { value: "custom", label: "Custom Badge" },
];

const SETUP_SQL = `create table if not exists branch_promotions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  title text not null,
  department text,
  category text,
  price numeric,
  description text,
  badge text,
  discount_type text check (discount_type in ('percent', 'fixed', 'bogo', 'custom')),
  discount_value text,
  valid_from date,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table branch_promotions enable row level security;
create policy "Admin full access promotions" on branch_promotions
  for all to authenticated using (true) with check (true);`;

const emptyForm = {
  title: "",
  department: "",
  category: "",
  price: "",
  priceMedium: "",
  priceLong: "",
  description: "",
  badge: "",
  discount_type: "" as "" | "percent" | "fixed" | "bogo" | "custom",
  discount_value: "",
  valid_from: "",
  valid_until: "",
  is_active: true,
  extra_branch_ids: [] as string[],
  serviceType: "" as "" | "MesoLipo",
  mesolipoRFPrice: "",
  mesolipoExislimPrice: "",
};

const emptySpaForm = {
  title: "",
  inclusions: [""] as string[],
  package_price: "",
  original_price: "",
  branch_ids: [] as string[],
  valid_from: "",
  valid_until: "",
  is_active: true,
  included_services: "",
};

export default function PromotionsTab({ branchId }: { branchId: string }) {
  const supabase = createClient();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [branchName, setBranchName] = useState("");
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [spaModalOpen, setSpaModalOpen] = useState(false);
  const [editingSpa, setEditingSpa] = useState<Promotion | null>(null);
  const [spaForm, setSpaForm] = useState(emptySpaForm);
  const [savingSpa, setSavingSpa] = useState(false);
  const [spaError, setSpaError] = useState<string | null>(null);
  const [allBranches, setAllBranches] = useState<{ id: string; name: string }[]>([]);
  const [confirmSpaBranch, setConfirmSpaBranch] = useState<{ id: string; name: string } | null>(null);
  const [confirmPromoBranch, setConfirmPromoBranch] = useState<{ id: string; name: string } | null>(null);
  const [editingMesolipoExislim, setEditingMesolipoExislim] = useState<Promotion | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteTitle, setConfirmDeleteTitle] = useState<string | null>(null);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  const [confirmDeleteIsGroup, setConfirmDeleteIsGroup] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("branch_promotions")
      .select("*")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01") setTableError(true);
      setLoading(false);
      return;
    }
    setPromotions((data ?? []) as Promotion[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!branchId) return;
    load();
    supabase
      .from("branches")
      .select("id, name")
      .then(({ data }) => {
        const rows = (data ?? []) as { id: string; name: string }[];
        setAllBranches(rows);
        const current = rows.find((r) => r.id === branchId);
        if (current) setBranchName(current.name);
      });
  }, [branchId]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setSaveError(null);
    setModalOpen(true);
  }

  function openEditMesolipoGroup(rf: Promotion, exislim: Promotion) {
    setEditing(rf);
    setEditingMesolipoExislim(exislim);
    setForm({
      ...emptyForm,
      title: rf.title.replace(" - with free RF", ""),
      department: rf.department ?? "",
      category: rf.category ?? "",
      serviceType: "MesoLipo",
      mesolipoRFPrice: rf.price != null ? rf.price.toLocaleString() : "",
      mesolipoExislimPrice: exislim.price != null ? exislim.price.toLocaleString() : "",
    });
    setSaveError(null);
    setModalOpen(true);
  }

  function openEdit(p: Promotion) {
    setEditing(p);
    setForm({
      title: p.title,
      department: p.department ?? "",
      category: p.category ?? "",
      price: p.price != null ? p.price.toLocaleString() : "",
      priceMedium: p.price_medium != null ? p.price_medium.toLocaleString() : "",
      priceLong: p.price_long != null ? p.price_long.toLocaleString() : "",
      description: p.description ?? "",
      badge: p.badge ?? "",
      discount_type: p.discount_type ?? "",
      discount_value: p.discount_value ?? "",
      valid_from: p.valid_from ?? "",
      valid_until: p.valid_until ?? "",
      is_active: p.is_active,
      extra_branch_ids: [],
    });
    setSaveError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.department) { setSaveError("Please select a department."); return; }
    if (!form.category) { setSaveError("Please select a category."); return; }
    setSaving(true);
    setSaveError(null);

    // MesoLipo path
    if (form.serviceType === "MesoLipo") {
      if (!form.title.trim()) { setSaveError("Service name is required."); setSaving(false); return; }
      const baseName = form.title.trim();
      const rfPrice = Number(form.mesolipoRFPrice.replace(/,/g, "")) || null;
      const exislimPrice = Number(form.mesolipoExislimPrice.replace(/,/g, "")) || null;
      const base = { branch_id: branchId, department: form.department || null, category: form.category || null, badge: null, discount_type: null, discount_value: null, valid_from: null, valid_until: null, is_active: true, description: null };
      if (editing && editingMesolipoExislim) {
        await supabase.from("branch_promotions").update({ ...base, title: `${baseName} - with free RF`, price: rfPrice }).eq("id", editing.id);
        await supabase.from("branch_promotions").update({ ...base, title: `${baseName} - with free RF & Exislim`, price: exislimPrice }).eq("id", editingMesolipoExislim.id);
        const rfTitle = `${baseName} - with free RF`;
        const exTitle = `${baseName} - with free RF & Exislim`;
        for (const bid of form.extra_branch_ids) {
          const [{ data: exRF }, { data: exEx }] = await Promise.all([
            supabase.from("branch_promotions").select("id").eq("branch_id", bid).eq("title", rfTitle).maybeSingle(),
            supabase.from("branch_promotions").select("id").eq("branch_id", bid).eq("title", exTitle).maybeSingle(),
          ]);
          if (exRF) { await supabase.from("branch_promotions").update({ ...base, branch_id: bid, title: rfTitle, price: rfPrice }).eq("id", exRF.id); }
          else { await supabase.from("branch_promotions").insert({ ...base, branch_id: bid, title: rfTitle, price: rfPrice }); }
          if (exEx) { await supabase.from("branch_promotions").update({ ...base, branch_id: bid, title: exTitle, price: exislimPrice }).eq("id", exEx.id); }
          else { await supabase.from("branch_promotions").insert({ ...base, branch_id: bid, title: exTitle, price: exislimPrice }); }
        }
      } else {
        const allBranchIds = [branchId, ...form.extra_branch_ids];
        const { data: mesoDupes } = await supabase
          .from("branch_promotions")
          .select("id")
          .in("branch_id", allBranchIds)
          .like("title", `${baseName} - with free RF%`);
        if ((mesoDupes ?? []).length > 0) {
          setSaveError(`"${baseName}" MesoLipo promo already exists for the selected branch(es).`);
          setSaving(false);
          return;
        }
        const inserts = allBranchIds.flatMap((bid) => [
          { ...base, branch_id: bid, title: `${baseName} - with free RF`, price: rfPrice },
          { ...base, branch_id: bid, title: `${baseName} - with free RF & Exislim`, price: exislimPrice },
        ]);
        const { error } = await supabase.from("branch_promotions").insert(inserts);
        if (error) { setSaveError(error.message); setSaving(false); return; }
      }
      setEditingMesolipoExislim(null);
      setSaving(false);
      setModalOpen(false);
      load();
      return;
    }

    if (!form.title.trim()) { setSaveError("Service name is required."); setSaving(false); return; }
    if (form.category === "Hair Services") {
      if (!form.price || !form.priceMedium || !form.priceLong) { setSaveError("Please enter Short, Medium, and Long prices."); setSaving(false); return; }
    } else {
      if (!form.price || Number(form.price.replace(/,/g, "")) <= 0) { setSaveError("Please enter a valid price."); setSaving(false); return; }
    }

    // Duplicate check
    const allTargetBranchIds = editing ? form.extra_branch_ids : [branchId, ...form.extra_branch_ids];
    const checkBranchIds = editing ? [branchId, ...form.extra_branch_ids] : allTargetBranchIds;
    const { data: dupes } = await supabase
      .from("branch_promotions")
      .select("id, branch_id, title, category, department")
      .in("branch_id", checkBranchIds)
      .eq("title", form.title.trim())
      .eq("department", form.department)
      .eq("category", form.category);
    const dupeList = (dupes ?? []).filter(d => !editing || d.id !== editing.id);
    if (dupeList.length > 0) {
      setSaveError(`"${form.title.trim()}" already exists in ${form.department} / ${form.category} for the selected branch(es).`);
      setSaving(false);
      return;
    }

    const payload = {
      branch_id: branchId,
      title: form.title.trim(),
      department: form.department || null,
      category: form.category || null,
      price: form.price ? Number(form.price.replace(/,/g, "")) : null,
      price_medium: form.category === "Hair Services" && form.priceMedium ? Number(form.priceMedium.replace(/,/g, "")) : null,
      price_long: form.category === "Hair Services" && form.priceLong ? Number(form.priceLong.replace(/,/g, "")) : null,
      description: form.description.trim() || null,
      badge: computeBadge(),
      discount_type: form.discount_type || null,
      discount_value: form.discount_value.trim() || null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      is_active: form.is_active,
    };

    if (editing) {
      const { error } = await supabase.from("branch_promotions").update(payload).eq("id", editing.id);
      if (error) { setSaveError(error.message); setSaving(false); return; }

      for (const bid of form.extra_branch_ids) {
        const { data: existing } = await supabase
          .from("branch_promotions")
          .select("id")
          .eq("branch_id", bid)
          .eq("title", editing.title)
          .maybeSingle();
        if (existing) {
          await supabase.from("branch_promotions").update({ ...payload, branch_id: bid }).eq("id", existing.id);
        } else {
          await supabase.from("branch_promotions").insert({ ...payload, branch_id: bid });
        }
      }
    } else {
      const inserts = [payload, ...form.extra_branch_ids.map((bid) => ({ ...payload, branch_id: bid }))];
      const { error } = await supabase.from("branch_promotions").insert(inserts);
      if (error) { setSaveError(error.message); setSaving(false); return; }
    }

    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function confirmDelete(allBranches: boolean) {
    if (!confirmDeleteId) return;
    if (confirmDeleteIsGroup && confirmDeleteTitle) {
      let q = supabase.from("branch_promotions").delete().like("title", confirmDeleteTitle + " - with free RF%");
      if (!allBranches) q = q.eq("branch_id", branchId);
      await q;
    } else if (allBranches && confirmDeleteTitle) {
      let query = supabase.from("branch_promotions").delete().eq("title", confirmDeleteTitle);
      if (confirmDeleteCategory) query = query.eq("category", confirmDeleteCategory);
      await query;
    } else {
      await supabase.from("branch_promotions").delete().eq("id", confirmDeleteId);
    }
    setConfirmDeleteId(null);
    setConfirmDeleteTitle(null);
    setConfirmDeleteCategory(null);
    setConfirmDeleteIsGroup(false);
    load();
  }

  async function toggleActive(p: Promotion) {
    const next = !p.is_active;
    setPromotions((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: next } : x));
    const { error } = await supabase.from("branch_promotions").update({ is_active: next }).eq("id", p.id);
    if (error) setPromotions((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: p.is_active } : x));
  }

  function openAddSpa() {
    setEditingSpa(null);
    setSpaForm({ ...emptySpaForm, branch_ids: [branchId] });
    setSpaError(null);
    setSpaModalOpen(true);
  }

  function openEditSpa(p: Promotion) {
    setEditingSpa(p);
    const lines = (p.description ?? "").split("\n").filter(Boolean);
    setSpaForm({
      ...emptySpaForm,
      title: p.title,
      inclusions: lines.length > 0 ? lines : [""],
      package_price: p.price != null ? p.price.toLocaleString() : "",
      branch_ids: [p.branch_id],
    });
    setSpaError(null);
    setSpaModalOpen(true);
  }

  async function handleSaveSpa(e: React.FormEvent) {
    e.preventDefault();
    if (!spaForm.title) { setSpaError("Select a service type (BASIC or PREMIUM)."); return; }
    setSavingSpa(true);
    setSpaError(null);

    const basePayload = {
      title: spaForm.title.trim() || "Spa Package",
      department: null,
      category: "Spa Package",
      price: spaForm.package_price ? Number(spaForm.package_price.replace(/,/g, "")) : null,
      description: spaForm.inclusions.filter(Boolean).join("\n") || null,
      badge: "SPA PKG",
      discount_type: null,
      discount_value: null,
      valid_from: null,
      valid_until: null,
      is_active: true,
    };

    if (editingSpa) {
      const { error } = await supabase.from("branch_promotions").update(basePayload).eq("id", editingSpa.id);
      if (error) { setSpaError(error.message); setSavingSpa(false); return; }
    } else {
      const { error } = await supabase.from("branch_promotions").insert({ ...basePayload, branch_id: branchId });
      if (error) { setSpaError(error.message); setSavingSpa(false); return; }
    }

    setSavingSpa(false);
    setSpaModalOpen(false);
    load();
  }

  function computeBadge() {
    if (form.discount_type === "percent") return `${form.discount_value}% OFF`;
    if (form.discount_type === "fixed") return `₱${form.discount_value} OFF`;
    if (form.discount_type === "bogo") return "BOGO FREE";
    return form.badge.trim() || null;
  }

  function formatDate(d: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }

  if (tableError) {
    return (
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <Tag className="h-7 w-7 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold text-ink">One-time setup required</h3>
          <p className="mt-2 text-sm text-ink/50">
            The <code className="rounded bg-ink/5 px-1 py-0.5 text-xs">branch_promotions</code> table doesn&apos;t exist yet.
            Paste this SQL into your{" "}
            <a href="https://supabase.com/dashboard/project/zxcgdirwkzdiufmhstau/sql" target="_blank" rel="noreferrer" className="text-coral underline">
              Supabase SQL editor
            </a>{" "}
            and run it once.
          </p>
          <div className="relative mt-4 rounded-xl border border-ink/10 bg-ink/[0.02] p-4 text-left">
            <pre className="overflow-x-auto text-xs text-ink/70">{SETUP_SQL}</pre>
            <button
              onClick={() => { navigator.clipboard.writeText(SETUP_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="absolute right-3 top-3 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs font-medium text-ink/60 hover:border-coral hover:text-coral"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button onClick={load} className="mt-5 rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-ink">Promo Packages</h3>
          <p className="text-base text-ink/40">{(() => {
            const spa = promotions.filter(p => p.category === "Spa Package").length;
            const reg = promotions.filter(p => p.category !== "Spa Package");
            const paired = new Set<string>();
            let grp = 0;
            for (const p of reg) {
              if (!p.title.endsWith(" - with free RF")) continue;
              const ex = reg.find(q => q.title === `${p.title.replace(" - with free RF", "")} - with free RF & Exislim`);
              if (ex) { paired.add(p.id); paired.add(ex.id); grp++; }
            }
            const total = spa + grp + reg.filter(p => !paired.has(p.id)).length;
            return `${total} promo package${total !== 1 ? "s" : ""} for this branch`;
          })()}</p>
        </div>
        <div className="flex gap-2">
          {branchName === "One Cecilia Center" && (
            <button
              onClick={openAddSpa}
              className="flex items-center gap-2 rounded-full border border-coral px-5 py-2.5 text-base font-semibold text-coral hover:bg-coral hover:text-white transition-colors"
            >
              <Plus className="h-5 w-5" /> Add Spa Packages Promo
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-base font-semibold text-white hover:bg-coral-dark"
          >
            <Plus className="h-5 w-5" /> Add Promo
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-base text-ink/40 shadow-sm">Loading promo packages...</div>
      ) : (() => {
        const spaPackages = promotions.filter((p) => p.category === "Spa Package");
        const regularPromos = promotions.filter((p) => p.category !== "Spa Package");
        const filteredPromos = regularPromos.filter((p) =>
          (!filterCategory || p.category === filterCategory) &&
          (!searchQuery || [p.title, p.department, p.category].some((f) => f?.toLowerCase().includes(searchQuery.toLowerCase())))
        );
        const _pairedIds = new Set<string>();
        let _groupCount = 0;
        for (const p of filteredPromos) {
          if (!p.title.endsWith(" - with free RF")) continue;
          const bn = p.title.replace(" - with free RF", "");
          const ex = filteredPromos.find(q => q.title === `${bn} - with free RF & Exislim`);
          if (ex) { _pairedIds.add(p.id); _pairedIds.add(ex.id); _groupCount++; }
        }
        const filteredDisplayCount = _groupCount + filteredPromos.filter(p => !_pairedIds.has(p.id)).length;

        const PromoCard = ({ p, isSpa }: { p: Promotion; isSpa: boolean }) => {
          const inclusions = isSpa ? (p.description ?? "").split("\n").filter(Boolean) : [];
          return (
            <div className={`flex flex-col rounded-2xl bg-white p-5 shadow-sm transition-opacity ${p.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {isSpa ? (
                    <>
                      <span className="inline-block rounded border border-[#C9A84A] px-2 py-0.5 text-xs font-bold text-[#C9A84A] tracking-wide">{p.title}</span>
                      {p.price != null && (
                        <p className="mt-2 text-sm text-ink/50">Php <span className="text-2xl font-bold text-ink">{p.price.toLocaleString()}</span></p>
                      )}
                      {inclusions.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {inclusions.map((line, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-sm text-ink/60">
                              <span className="mt-0.5 text-coral font-bold shrink-0">✓</span>{line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <>
                      <h4 className="truncate text-base font-semibold text-ink">{p.title}</h4>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.department && <span className="rounded-full bg-blush px-2.5 py-0.5 text-sm text-ink/60">{p.department}</span>}
                        {p.category && <span className="rounded-full bg-blush px-2.5 py-0.5 text-sm text-ink/60">{p.category}</span>}
                      </div>
                      {p.price != null && (
                        <p className="mt-1.5 text-lg font-bold text-ink">₱{p.price.toLocaleString()}.00</p>
                      )}
                      {p.description && <p className="mt-1 text-base text-ink/50 line-clamp-2">{p.description}</p>}
                    </>
                  )}
                </div>
                {!isSpa && p.badge && (
                  <span className="shrink-0 rounded-full bg-coral/10 px-2.5 py-1 text-xs font-bold text-coral">{p.badge}</span>
                )}
              </div>

              {(p.valid_from || p.valid_until) && (
                <p className="mt-3 text-xs text-ink/40">
                  {p.valid_from && <>From {formatDate(p.valid_from)}</>}
                  {p.valid_from && p.valid_until && " · "}
                  {p.valid_until && <>Until {formatDate(p.valid_until)}</>}
                </p>
              )}

              <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                <div className="flex gap-1 ml-auto">
                  <button
                    onClick={() => isSpa ? openEditSpa(p) : openEdit(p)}
                    className="rounded-lg p-2.5 text-ink/40 hover:bg-blush hover:text-coral-dark"
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button onClick={() => { setConfirmDeleteId(p.id); setConfirmDeleteTitle(p.title); setConfirmDeleteCategory(p.category); }} className="rounded-lg p-2.5 text-ink/40 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {spaPackages.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <p className="text-base font-semibold uppercase tracking-wide text-ink/40">Spa Packages</p>
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-sm font-semibold text-ink/40">{spaPackages.length}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {spaPackages.map((p) => <PromoCard key={p.id} p={p} isSpa />)}
                </div>
              </div>
            )}
            {regularPromos.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold uppercase tracking-wide text-ink/40">Service Promos</p>
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-sm font-semibold text-ink/40">{filteredDisplayCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="rounded-full border border-ink/15 px-4 py-2 text-base text-ink/70 outline-none focus:border-coral"
                    >
                      <option value="">All Categories</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 focus-within:border-coral">
                      <svg className="h-4 w-4 shrink-0 text-ink/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/></svg>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search service..."
                        className="w-full text-base outline-none placeholder:text-ink/30"
                      />
                    </div>
                  </div>
                </div>
                {(() => {
                  const filtered = regularPromos.filter((p) =>
                    (!filterCategory || p.category === filterCategory) &&
                    (!searchQuery || [p.title, p.department, p.category].some((f) => f?.toLowerCase().includes(searchQuery.toLowerCase())))
                  );
                  const categoryOrder: string[] = [];
                  const byCategory: Record<string, Promotion[]> = {};
                  for (const p of filtered) {
                    const cat = p.category ?? "";
                    if (!byCategory[cat]) { byCategory[cat] = []; categoryOrder.push(cat); }
                    byCategory[cat].push(p);
                  }
                  if (filtered.length === 0) return null;
                  return (
                    <div className="space-y-4">
                      {categoryOrder.map((cat) => {
                        const catPromos = byCategory[cat];
                        const isNonSurgical = cat === "Non-Surgical Liposuction";
                        const mesolipoGroups: { rf: Promotion; exislim: Promotion; baseName: string }[] = [];
                        const groupedIds = new Set<string>();
                        if (isNonSurgical) {
                          for (const p of catPromos) {
                            if (!p.title.endsWith(" - with free RF")) continue;
                            const bn = p.title.replace(" - with free RF", "");
                            const ex = catPromos.find(q => q.title === `${bn} - with free RF & Exislim`);
                            if (ex) { mesolipoGroups.push({ rf: p, exislim: ex, baseName: bn }); groupedIds.add(p.id); groupedIds.add(ex.id); }
                          }
                        }
                        return (
                          <div key={cat} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                            <table className="w-full text-base">
                              <thead>
                                <tr className="border-b border-ink/10 text-base font-semibold uppercase text-ink/40">
                                  <th className="pb-3 px-5 pt-4 text-left">Service</th>
                                  <th className="pb-3 px-5 pt-4 text-left">Department</th>
                                  <th className="pb-3 px-5 pt-4 text-left">Category</th>
                                  {cat === "Slimming Services" && <th className="pb-3 px-5 pt-4 text-left">Duration</th>}
                                  <th className={`pb-3 px-5 pt-4 ${cat === "Slimming Services" ? "text-center" : "text-right"}`}>{isNonSurgical ? "3+2 Sessions" : cat === "Slimming Services" ? "Per Session" : cat === "Facial Services" ? "5 Sessions" : "Price"}</th>
                                  <th className="pb-3 px-5 pt-4 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mesolipoGroups.map(({ rf: rfPromo, exislim: exislimPromo, baseName }) => (
                                  <tr key={`mesolipo-${rfPromo.id}`} className="border-b border-ink/5 last:border-0">
                                    <td className="px-5 py-4 align-middle">
                                      <p className="font-semibold text-ink">{baseName}</p>
                                      <p className="text-sm text-ink/50 mt-0.5">MesoLipo</p>
                                    </td>
                                    <td className="px-5 py-4 align-middle text-ink/60">{rfPromo.department ?? "—"}</td>
                                    <td className="px-5 py-4 align-middle font-semibold text-ink">{rfPromo.category ?? "—"}</td>
                                    <td className="px-5 py-4 align-middle">
                                      <div className="flex items-center justify-end gap-4">
                                        <span className="text-sm text-ink/50">with free RF</span>
                                        <span className="text-sm font-bold text-ink">{rfPromo.price != null ? `₱${rfPromo.price.toLocaleString()}.00` : "—"}</span>
                                      </div>
                                      <div className="flex items-center justify-end gap-4 mt-1">
                                        <span className="text-sm text-ink/50">with free RF & Exislim</span>
                                        <span className="text-sm font-bold text-ink">{exislimPromo.price != null ? `₱${exislimPromo.price.toLocaleString()}.00` : "—"}</span>
                                      </div>
                                    </td>
                                    <td className="px-5 py-4 align-middle text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => openEditMesolipoGroup(rfPromo, exislimPromo)} className="rounded-lg p-2 text-ink/30 hover:bg-blush hover:text-coral-dark">
                                          <Pencil className="h-6 w-6" />
                                        </button>
                                        <button onClick={() => { setConfirmDeleteId(rfPromo.id); setConfirmDeleteTitle(baseName); setConfirmDeleteCategory(rfPromo.category); setConfirmDeleteIsGroup(true); }} className="rounded-lg p-2 text-ink/30 hover:bg-red-50 hover:text-red-500">
                                          <Trash2 className="h-6 w-6" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {catPromos.filter(p => !groupedIds.has(p.id)).map((p) => (
                                  <tr key={p.id} className="border-b border-ink/5 last:border-0">
                                    <td className="px-5 py-4">
                                      <p className="font-semibold text-ink">{p.title}</p>
                                      {p.badge && <p className="text-sm text-ink/50 mt-0.5">{p.badge}</p>}
                                    </td>
                                    <td className="px-5 py-4 text-ink/60">{p.department ?? "—"}</td>
                                    <td className="px-5 py-4 font-semibold text-ink">{p.category ?? "—"}</td>
                                    {p.category === "Slimming Services" && (
                                      <td className="px-5 py-4 text-ink/50">
                                        {p.description ? (
                                          <span className="flex items-center gap-1 text-sm">
                                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/></svg>
                                            {p.description}
                                          </span>
                                        ) : "—"}
                                      </td>
                                    )}
                                    <td className={`px-5 py-4 text-sm font-bold text-ink ${p.category === "Slimming Services" ? "text-center" : "text-right"}`}>
                                      {p.category === "Hair Services" ? (
                                        <div className="flex flex-col items-end gap-0.5">
                                          {p.price != null && <div className="flex gap-2"><span className="text-xs font-normal text-ink/40">Short</span><span>₱{p.price.toLocaleString()}.00</span></div>}
                                          {p.price_medium != null && <div className="flex gap-2"><span className="text-xs font-normal text-ink/40">Medium</span><span>₱{p.price_medium.toLocaleString()}.00</span></div>}
                                          {p.price_long != null && <div className="flex gap-2"><span className="text-xs font-normal text-ink/40">Long</span><span>₱{p.price_long.toLocaleString()}.00</span></div>}
                                        </div>
                                      ) : p.price != null ? `₱${p.price.toLocaleString()}.00` : "—"}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => openEdit(p)} className="rounded-lg p-2 text-ink/30 hover:bg-blush hover:text-coral-dark">
                                          <Pencil className="h-6 w-6" />
                                        </button>
                                        <button onClick={() => { setConfirmDeleteId(p.id); setConfirmDeleteTitle(p.title); setConfirmDeleteCategory(p.category); }} className="rounded-lg p-2 text-ink/30 hover:bg-red-50 hover:text-red-500">
                                          <Trash2 className="h-6 w-6" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
            {promotions.length === 0 && (
              <div className="rounded-2xl bg-white p-16 text-center shadow-sm">
                <Tag className="mx-auto mb-3 h-10 w-10 text-ink/20" />
                <p className="font-medium text-ink/40">No promo packages yet</p>
              </div>
            )}
          </div>
        );
      })()}

      {spaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl max-h-[90vh]">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{editingSpa ? "Edit Spa Package" : "Add Spa Packages Promo"}</h2>
              <button onClick={() => setSpaModalOpen(false)} className="text-ink/40 hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSpa} className="space-y-4">
              {/* Service Type */}
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Service Type *</label>
                <div className="mt-1 grid grid-cols-2 gap-3">
                  {(["BASIC", "PREMIUM"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSpaForm((f) => ({ ...f, title: t, inclusions: SPA_TIER_DEFAULTS[t] ?? [] }))}
                      className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                        spaForm.title === t
                          ? "border-[#C9A84A] bg-[#C9A84A] text-white"
                          : "border-ink/15 text-ink/60 hover:border-[#C9A84A] hover:text-[#C9A84A]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inclusions preview */}
              {spaForm.title && SPA_TIER_DEFAULTS[spaForm.title] && (
                <div className="rounded-lg border border-ink/10 bg-ink/[0.02] px-3 py-3">
                  <p className="mb-2 text-xs font-medium uppercase text-ink/40">Inclusions</p>
                  <ul className="space-y-1">
                    {SPA_TIER_DEFAULTS[spaForm.title].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-ink/70">
                        <span className="mt-0.5 shrink-0 font-bold text-[#C9A84A]">✓</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Price */}
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Price *</label>
                <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                  <span className="text-sm text-ink/40">Php</span>
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    value={spaForm.package_price}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      setSpaForm({ ...spaForm, package_price: raw ? Number(raw).toLocaleString() : "" });
                    }}
                    placeholder="0"
                    className="w-full text-sm outline-none"
                  />
                </div>
              </div>



              {spaError && <p className="text-sm text-red-600">{spaError}</p>}

              <div className="flex gap-3 border-t border-ink/10 pt-4">
                <button
                  type="button"
                  onClick={() => setSpaModalOpen(false)}
                  className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSpa}
                  className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                >
                  {savingSpa ? "Saving..." : editingSpa ? "Save Changes" : "Add Package"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmSpaBranch && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mx-auto">
              <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            </div>
            <h3 className="mt-4 text-center text-lg font-semibold text-ink">Add to Another Branch?</h3>
            <p className="mt-2 text-center text-sm text-ink/50">
              This promo will also be added to <span className="font-semibold text-ink">{confirmSpaBranch.name}</span>.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmSpaBranch(null)}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const b = confirmSpaBranch;
                  setSpaForm((f) => ({ ...f, branch_ids: [...f.branch_ids, b.id] }));
                  setConfirmSpaBranch(null);
                }}
                className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPromoBranch && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mx-auto">
              <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            </div>
            <h3 className="mt-4 text-center text-lg font-semibold text-ink">Add to Another Branch?</h3>
            <p className="mt-2 text-center text-sm text-ink/50">
              This promo will also be added to <span className="font-semibold text-ink">{confirmPromoBranch.name}</span>.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmPromoBranch(null)}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const b = confirmPromoBranch;
                  setForm((f) => ({ ...f, extra_branch_ids: [...f.extra_branch_ids, b.id] }));
                  setConfirmPromoBranch(null);
                }}
                className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Trash2 className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="mt-4 text-center text-lg font-semibold text-ink">Remove Promo Package?</h3>
            <p className="mt-2 text-center text-sm text-ink/50">
              {confirmDeleteCategory === "Spa Package"
                ? "This spa package will be permanently removed."
                : "Remove from this branch only, or from all branches?"}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {confirmDeleteCategory !== "Spa Package" && (
                <button
                  onClick={() => confirmDelete(true)}
                  className="w-full rounded-full bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
                >
                  Remove from All Branches
                </button>
              )}
              <button
                onClick={() => confirmDelete(false)}
                className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50"
              >
                {confirmDeleteCategory === "Spa Package" ? "Remove Package" : "This Branch Only"}
              </button>
              <button
                onClick={() => { setConfirmDeleteId(null); setConfirmDeleteTitle(null); setConfirmDeleteCategory(null); setConfirmDeleteIsGroup(false); }}
                className="w-full rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl max-h-[90vh]">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{editing ? "Edit Promo Package" : "Add Promo Package"}</h2>
              <button onClick={() => { setModalOpen(false); setEditingMesolipoExislim(null); }} className="text-ink/40 hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Service Name */}
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Service Name <span className="text-red-500">*</span></label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Deep Cleansing Facial"
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                />
              </div>

              {/* Non-Surgical Liposuction — Service Type */}
              {form.category === "Non-Surgical Liposuction" && (
                <div className="rounded-xl border border-ink/10 bg-blush/20 p-4 space-y-3">
                  <label className="text-sm font-medium text-ink/70">Service Type</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, serviceType: f.serviceType === "MesoLipo" ? "" : "MesoLipo" }))}
                      className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.serviceType === "MesoLipo" ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}
                    >
                      MesoLipo
                    </button>
                  </div>
                  {form.serviceType === "MesoLipo" && (
                    <div className="space-y-3 pt-1">
                      <p className="text-sm font-semibold uppercase tracking-wide text-ink/40">3+2 Sessions</p>
                      <div>
                        <label className="text-xs font-medium uppercase text-ink/40">with free RF <span className="text-red-500">*</span></label>
                        <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 bg-white px-3 py-2 focus-within:border-coral">
                          <span className="text-sm text-ink/40">₱</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={form.mesolipoRFPrice}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setForm((f) => ({ ...f, mesolipoRFPrice: raw ? Number(raw).toLocaleString() : "" }));
                            }}
                            placeholder="0"
                            className="w-full text-sm outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium uppercase text-ink/40">with free RF & Exislim <span className="text-red-500">*</span></label>
                        <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 bg-white px-3 py-2 focus-within:border-coral">
                          <span className="text-sm text-ink/40">₱</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={form.mesolipoExislimPrice}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setForm((f) => ({ ...f, mesolipoExislimPrice: raw ? Number(raw).toLocaleString() : "" }));
                            }}
                            placeholder="0"
                            className="w-full text-sm outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Department + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium uppercase text-ink/40">Department <span className="text-red-500">*</span></label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                  >
                    <option value="">— Select —</option>
                    {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase text-ink/40">Category <span className="text-red-500">*</span></label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                  >
                    <option value="">— Select —</option>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Price + Duration */}
              {form.category !== "Non-Surgical Liposuction" && (
                form.category === "Hair Services" ? (
                  <div className="grid grid-cols-3 gap-3">
                    {(["Short", "Medium", "Long"] as const).map((label) => {
                      const key = label === "Short" ? "price" : label === "Medium" ? "priceMedium" : "priceLong";
                      return (
                        <div key={label}>
                          <label className="text-xs font-medium uppercase text-ink/40">{label} <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/40">₱</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={form[key as keyof typeof form] as string}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, "");
                                setForm({ ...form, [key]: raw ? Number(raw).toLocaleString() : "" });
                              }}
                              placeholder="0"
                              className="w-full text-sm outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={form.category === "Slimming Services" ? "grid grid-cols-2 gap-3" : ""}>
                    <div>
                      <label className="text-xs font-medium uppercase text-ink/40">
                        {form.category === "Slimming Services" ? "Per Session" : form.category === "Facial Services" ? "5 Sessions" : "Price"} <span className="text-red-500">*</span>
                      </label>
                      <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                        <span className="text-sm text-ink/40">₱</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={form.price}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            setForm({ ...form, price: raw ? Number(raw).toLocaleString() : "" });
                          }}
                          placeholder="0"
                          className="w-full text-sm outline-none"
                        />
                      </div>
                    </div>
                    {form.category === "Slimming Services" && (
                      <div>
                        <label className="text-xs font-medium uppercase text-ink/40">Duration <span className="text-ink/30">(Optional)</span></label>
                        <select
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink outline-none focus:border-coral"
                        >
                          <option value="">— Select —</option>
                          {["30 mins.", "45 mins.", "60 mins.", "75 mins.", "90 mins.", "2 hours", "3 hours"].map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* Assigned Branch */}
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Assigned Branch</label>
                <div className="mt-1 space-y-2 rounded-lg border border-ink/15 px-3 py-2.5">
                  {[...allBranches].sort((a, b) => (a.name === "One Cecilia Center" ? -1 : b.name === "One Cecilia Center" ? 1 : 0)).map((b) => {
                    const isCurrent = b.id === branchId;
                    return (
                      <label key={b.id} className={`flex items-center gap-3 ${isCurrent ? "cursor-default" : "cursor-pointer"}`}>
                        <input
                          type="checkbox"
                          checked={isCurrent || form.extra_branch_ids.includes(b.id)}
                          readOnly={isCurrent}
                          onChange={isCurrent ? undefined : (e) => {
                            if (e.target.checked) {
                              setConfirmPromoBranch(b);
                            } else {
                              setForm({ ...form, extra_branch_ids: form.extra_branch_ids.filter((id) => id !== b.id) });
                            }
                          }}
                          className="h-4 w-4 accent-coral"
                        />
                        <span className="text-sm text-ink">{b.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>




              {saveError && <p className="text-sm text-red-600">{saveError}</p>}

              <div className="flex gap-3 border-t border-ink/10 pt-4">
                <button
                  type="button"
                  onClick={() => { setModalOpen(false); setEditingMesolipoExislim(null); }}
                  className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                >
                  {saving ? "Saving..." : editing ? "Save Changes" : "Add Promo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
