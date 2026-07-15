"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import {
  BarChart2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit,
  ImageIcon,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  Settings,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { adminBranches } from "@/lib/adminData";
import { branchServiceCategories } from "@/lib/data";

type Branch = (typeof adminBranches)[number];

const TABS = ["Overview", "Services", "Staff", "Gallery", "Promotions", "Reviews", "Analytics"];

const MOCK_STATS = [
  { label: "Today's Appointments", value: "28" },
];

const SERVICE_CATEGORIES = [
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

const CATEGORY_COLORS: Record<string, string> = {
  "Doctor's Procedure": "bg-blue-100 text-blue-700",
  "Non-Surgical Liposuction": "bg-purple-100 text-purple-700",
  "Slimming Services": "bg-pink-100 text-pink-700",
  "Cocktail Drips": "bg-teal-100 text-teal-700",
  "Laser Services": "bg-amber-100 text-amber-700",
  "Premium Treatments": "bg-rose-100 text-rose-700",
  "Facial Services": "bg-orange-100 text-orange-700",
  "Body & Wellness": "bg-green-100 text-green-700",
  "Brows & Lashes": "bg-violet-100 text-violet-700",
  "Nail Care": "bg-fuchsia-100 text-fuchsia-700",
  "Hair Services": "bg-cyan-100 text-cyan-700",
};


type ServiceRow = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string;
  price1: number;
  price5: number | null;
  sessions5: number;
  status: "Active" | "Inactive";
  description: string;
  benefits: string;
  displayOrder: number;
  imageUrl: string;
  branches: string[];
  addonName?: string;
  addonPrice?: string;
  addons?: { name: string; price: string }[];
  hairOptions?: { type: string; subType?: string | null; prices?: { short: string; medium: string; long: string } } | null;
  browsType?: string | null;
  bodyWellnessType?: string | null;
  facialOptions?: { isPremium: boolean; hasAddons: boolean } | null;
  laserType?: string | null;
  slimmingType?: string | null;
  nonSurgicalType?: string | null;
  doctorType?: string | null;
};

function buildInitialServices(): ServiceRow[] {
  return [];
}

const CATEGORIES = ["All Categories", ...SERVICE_CATEGORIES];

const STAFF_INITIALS = ["MS", "JD", "AR"];

function StaffAvatars() {
  return (
    <div className="flex -space-x-2">
      {STAFF_INITIALS.map((initials, i) => (
        <span key={i} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blush text-[10px] font-bold text-coral-dark">
          {initials}
        </span>
      ))}
      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-ink/10 text-[10px] font-bold text-ink/60">+3</span>
    </div>
  );
}

const DURATION_OPTIONS = ["30 mins.", "45 mins.", "60 mins.", "75 mins.", "90 mins.", "2 hours", "3 hours"];
const BRANCH_OPTIONS = ["One Cecilia Center", "Robinsons Pagadian"];

const DEPARTMENTS = ["Nails", "Hair", "Clinic"];
const HAIR_SUBTYPES = ["Hair Color", "Straightening", "Treatment"] as const;

const emptyForm = {
  name: "",
  category: "",
  department: DEPARTMENTS[0],
  duration: "",
  price1: "",
  perSession: "1",
  sessions5: "5",
  price5: "",
  description: "",
  benefits: "",
  status: "Active" as "Active" | "Inactive",
  branches: [] as string[],
  addonName: "",
  addonPrice: "",
  addons: [] as { name: string; price: string }[],
  hairType: "" as "" | "Classic" | "Premium",
  hairSubType: "" as "" | "Hair Color" | "Straightening" | "Treatment",
  hairPriceShort: "",
  hairPriceMedium: "",
  hairPriceLong: "",
  browsType: "" as "" | "Eyelash Extensions" | "Semi Permanent Tattoo",
  bodyWellnessType: "" as "" | "Body Waxing",
  facialIsPremium: false,
  facialHasAddons: false,
  nailHasAddons: false,
  nailAddonPrice: "",
  enablePrice5: false,
  laserType: "" as "" | "Pico Snow Whitening Laser" | "Diode Hair Removal Laser" | "IPL (Intense, Pulse, Light)" | "Laser Treatment",
  slimmingType: "" as "" | "7D HIFU Ultra Lift" | "PowerSculpt" | "Exislim / Exilift",
  nonSurgicalType: "" as "" | "MesoLipo" | "Add On",
  doctorType: "" as "" | "Beauty-Tox" | "Non-Surgical Augmentation",
};

export default function BranchDetailView({ branch, onBack }: { branch: Branch; onBack: () => void }) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState("Services");
  const [showFab, setShowFab] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [branchUuid, setBranchUuid] = useState<string | null>(null);
  const [loadingServices, setLoadingServices] = useState(true);
  const [staffMembers, setStaffMembers] = useState<{ id: string; fullName: string; department: string; phone: string | null; avatarUrl: string | null }[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffCount, setStaffCount] = useState<number>(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [confirmBranch, setConfirmBranch] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState("All Categories");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editBranchOpen, setEditBranchOpen] = useState(false);
  const initialBranchForm = {
    name: branch.name,
    address: branch.address,
    phone: (branch as typeof branch & { phone?: string }).phone ?? "",
    hours: branch.hours,
    facebook: branch.facebook,
    facebookLabel: (branch as typeof branch & { facebookLabel?: string }).facebookLabel ?? branch.facebook,
    instagram: branch.instagram,
    instagramLabel: (branch as typeof branch & { instagramLabel?: string }).instagramLabel ?? branch.instagram,
    imageUrl: branch.image,
  };
  const [branchForm, setBranchForm] = useState(initialBranchForm);
  const [branchDraft, setBranchDraft] = useState(initialBranchForm);
  const [branchImageFile, setBranchImageFile] = useState<File | null>(null);
  const [branchImagePreview, setBranchImagePreview] = useState<string | null>(null);
  const branchFileRef = useRef<HTMLInputElement>(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [branchSaveError, setBranchSaveError] = useState<string | null>(null);

  async function loadStaff(uuid: string) {
    setLoadingStaff(true);
    const { data } = await supabase
      .from("staff_members")
      .select("id, full_name, department, phone, avatar_url")
      .eq("branch_id", uuid)
      .order("full_name", { ascending: true });
    setStaffMembers(
      (data ?? []).map((r: { id: string; full_name: string; department: string; phone: string | null; avatar_url: string | null }) => ({
        id: r.id,
        fullName: r.full_name,
        department: r.department,
        phone: r.phone,
        avatarUrl: r.avatar_url,
      }))
    );
    setLoadingStaff(false);
  }

  async function loadServices(uuid: string) {
    setLoadingServices(true);
    const { data } = await supabase
      .from("branch_services")
      .select("*")
      .eq("branch_id", uuid)
      .order("created_at");
    setServices(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        category: r.category as string,
        department: r.department as string,
        duration: (r.duration as string) ?? "",
        price1: r.price as number,
        price5: r.price_41 as number | null,
        sessions5: 5,
        status: (r.status as "Active" | "Inactive") ?? "Active",
        description: (r.description as string) ?? "",
        benefits: (r.benefits as string) ?? "",
        displayOrder: 1,
        imageUrl: "",
        branches: [branch.name],
        addons: (r.addons as ServiceRow["addons"]) ?? [],
        hairOptions: (r.hair_options as ServiceRow["hairOptions"]) ?? null,
        browsType: (r.brows_type as string) ?? null,
        bodyWellnessType: (r.body_wellness_type as string) ?? null,
        facialOptions: (r.facial_options as ServiceRow["facialOptions"]) ?? null,
        laserType: (r.laser_type as string) ?? null,
        slimmingType: (r.slimming_type as string) ?? null,
        nonSurgicalType: (r.non_surgical_type as string) ?? null,
        doctorType: (r.doctor_type as string) ?? null,
      }))
    );
    setLoadingServices(false);
  }

  useEffect(() => {
    supabase
      .from("branches")
      .select("id, name, address, phone, hours, facebook, facebook_label, instagram, instagram_label, image_url")
      .eq("name", branch.name)
      .single()
      .then(({ data, error }) => {
        if (error) console.error("Branch fetch error:", error.message);
        if (data?.id) {
          setBranchUuid(data.id);
          loadServices(data.id);
          supabase.from("staff_members").select("id", { count: "exact", head: true }).eq("branch_id", data.id).then(({ count }) => setStaffCount(count ?? 0));
          const hydrated = {
            name: (data.name as string) || branch.name,
            address: (data.address as string) || branch.address,
            phone: (data.phone as string) || (branch as typeof branch & { phone?: string }).phone || "",
            hours: (data.hours as string) || branch.hours,
            facebook: (data.facebook as string) || branch.facebook,
            facebookLabel: (data.facebook_label as string) || (branch as typeof branch & { facebookLabel?: string }).facebookLabel || branch.facebook,
            instagram: (data.instagram as string) || branch.instagram,
            instagramLabel: (data.instagram_label as string) || (branch as typeof branch & { instagramLabel?: string }).instagramLabel || branch.instagram,
            imageUrl: (data.image_url as string) || branch.image,
          };
          setBranchForm(hydrated);
          setBranchDraft(hydrated);
        } else {
          setLoadingServices(false);
        }
      });
  }, [branch.name]);

  const filtered = services.filter((s) => {
    const matchesCat = filterCat === "All Categories" || s.category === filterCat;
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.department.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  // Group filtered by category (all categories incl. custom ones)
  const allCategoryLabels = Array.from(new Set([
    ...branchServiceCategories.map((c) => c.label),
    ...SERVICE_CATEGORIES,
  ]));
  const grouped = allCategoryLabels
    .map((label) => ({
      label,
      rows: filtered.filter((s) => s.category === label),
    }))
    .filter((g) => g.rows.length > 0);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, branches: [branch.name] });
    setModalError(null);
    setModalOpen(true);
  }

  async function openEdit(svc: ServiceRow) {
    setEditing(svc);
    // Find all branches that have this service
    const { data: instances } = await supabase
      .from("branch_services")
      .select("branch_id")
      .eq("name", svc.name);
    const branchIds = (instances ?? []).map((r: { branch_id: string }) => r.branch_id);
    let allBranchNames: string[] = [branch.name];
    if (branchIds.length > 0) {
      const { data: branchRows } = await supabase.from("branches").select("name").in("id", branchIds);
      allBranchNames = (branchRows ?? []).map((r: { name: string }) => r.name);
      if (!allBranchNames.includes(branch.name)) allBranchNames.push(branch.name);
    }
    setForm({
      ...emptyForm,
      name: svc.name,
      category: svc.category,
      department: svc.department,
      duration: svc.duration,
      price1: svc.price1 ? svc.price1.toLocaleString() : "",
      perSession: "1",
      sessions5: String(svc.sessions5 ?? 5),
      price5: svc.price5 ? String(svc.price5) : "",
      description: svc.description,
      benefits: svc.benefits,
      status: svc.status,
      branches: allBranchNames,
      addonName: svc.addonName ?? "",
      addonPrice: svc.addonPrice ?? "",
      addons: svc.addons ?? [],
      hairType: (svc.hairOptions?.type as "" | "Classic" | "Premium") ?? "",
      hairSubType: (svc.hairOptions?.subType as "" | "Hair Color" | "Straightening" | "Treatment") ?? "",
      hairPriceShort: svc.hairOptions?.prices?.short ?? "",
      hairPriceMedium: svc.hairOptions?.prices?.medium ?? "",
      hairPriceLong: svc.hairOptions?.prices?.long ?? "",
      browsType: (svc.browsType as "" | "Eyelash Extensions" | "Semi Permanent Tattoo") ?? "",
      bodyWellnessType: (svc.bodyWellnessType as "" | "Body Waxing") ?? "",
      facialIsPremium: svc.facialOptions?.isPremium ?? false,
      facialHasAddons: svc.facialOptions?.hasAddons ?? false,
      nailHasAddons: Array.isArray(svc.addons) && svc.addons.length > 0,
      nailAddonPrice: (svc.addons?.[0] as { price?: string } | undefined)?.price ?? "",
      enablePrice5: svc.price5 != null && svc.category === "Premium Treatments",
      laserType: (svc.laserType as "" | "Pico Snow Whitening Laser" | "Diode Hair Removal Laser" | "IPL (Intense, Pulse, Light)" | "Laser Treatment") ?? "",
      slimmingType: (svc.slimmingType as "" | "7D HIFU Ultra Lift" | "PowerSculpt" | "Exislim / Exilift") ?? "",
      nonSurgicalType: (svc.nonSurgicalType as "" | "MesoLipo" | "Add On") ?? "",
      doctorType: (svc.doctorType as "" | "Beauty-Tox" | "Non-Surgical Augmentation") ?? "",
    });
    setModalError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!branchUuid) return;
    setSaving(true);

    const basePayload = {
      name: form.name.trim(),
      category: form.category,
      department: form.department,
      duration: form.duration || null,
      price: form.category === "Hair Services" ? 0 : Number(form.price1.replace(/,/g, "")),
      price_41: (form.category === "Laser Services" && form.laserType !== "Laser Treatment" && form.price5)
        ? Number(form.price5.toString().replace(/,/g, ""))
        : (form.category === "Cocktail Drips" && form.price5)
        ? Number(form.price5.toString().replace(/,/g, ""))
        : (form.category === "Slimming Services" && form.price5)
        ? Number(form.price5.toString().replace(/,/g, ""))
        : (form.category === "Non-Surgical Liposuction" && form.nonSurgicalType === "Add On" && form.price5)
        ? Number(form.price5.toString().replace(/,/g, ""))
        : (form.enablePrice5 && form.price5 ? Number(form.price5.toString().replace(/,/g, "")) : null),
      description: form.description || null,
      benefits: form.benefits || null,
      status: form.status,
      hair_options: form.category === "Hair Services" && form.hairType
        ? {
            type: form.hairType,
            subType: form.hairSubType || null,
            prices: {
              short: form.hairPriceShort,
              medium: form.hairPriceMedium,
              long: form.hairPriceLong,
            },
          }
        : null,
      addons: form.category === "Nail Care" ? (form.nailHasAddons ? [{ hasAddons: true }] : null) : null,
      brows_type: form.category === "Brows & Lashes" && form.browsType ? form.browsType : null,
      body_wellness_type: form.category === "Body & Wellness" && form.bodyWellnessType ? form.bodyWellnessType : null,
      facial_options: form.category === "Facial Services"
        ? { isPremium: form.facialIsPremium, hasAddons: form.facialHasAddons }
        : null,
      laser_type: form.category === "Laser Services" && form.laserType ? form.laserType : null,
      slimming_type: form.category === "Slimming Services" && form.slimmingType ? form.slimmingType : null,
      non_surgical_type: form.category === "Non-Surgical Liposuction" && form.nonSurgicalType ? form.nonSurgicalType : null,
      doctor_type: form.category === "Doctor's Procedure" && form.doctorType ? form.doctorType : null,
    };

    if (editing) {
      // Check if the edited result conflicts with a different existing service in current branch
      const { data: conflictRows } = await supabase
        .from("branch_services")
        .select("id, slimming_type, laser_type, brows_type, body_wellness_type, non_surgical_type, doctor_type, price, duration")
        .eq("branch_id", branchUuid!)
        .eq("name", basePayload.name)
        .eq("category", basePayload.category)
        .neq("id", editing.id);
      const conflict = ((conflictRows ?? []) as Array<{
        id: string; slimming_type: string | null; laser_type: string | null;
        brows_type: string | null; body_wellness_type: string | null;
        non_surgical_type: string | null; doctor_type: string | null; price: number | null; duration: string | null;
      }>).find(
        (r) =>
          r.slimming_type === basePayload.slimming_type &&
          r.laser_type === basePayload.laser_type &&
          r.brows_type === basePayload.brows_type &&
          r.body_wellness_type === basePayload.body_wellness_type &&
          r.non_surgical_type === basePayload.non_surgical_type &&
          r.doctor_type === basePayload.doctor_type &&
          r.price === basePayload.price &&
          r.duration === (basePayload.duration ?? null)
      );
      if (conflict) {
        setModalError(`"${basePayload.name}" already exists in this branch with the same type, price, and duration.`);
        setSaving(false);
        return;
      }

      // Dedup: only delete rows that are exact same variant (type-specific fields match), not different variants
      const { data: sameNameRows } = await supabase
        .from("branch_services")
        .select("id, slimming_type, laser_type, brows_type, body_wellness_type, non_surgical_type, doctor_type")
        .eq("branch_id", branchUuid!)
        .eq("name", editing.name)
        .neq("id", editing.id);
      const dupIds = ((sameNameRows ?? []) as Array<{
        id: string; slimming_type: string | null; laser_type: string | null;
        brows_type: string | null; body_wellness_type: string | null; non_surgical_type: string | null; doctor_type: string | null;
      }>)
        .filter(
          (r) =>
            r.slimming_type === (editing.slimmingType || null) &&
            r.laser_type === (editing.laserType || null) &&
            r.brows_type === (editing.browsType || null) &&
            r.body_wellness_type === (editing.bodyWellnessType || null) &&
            r.non_surgical_type === (editing.nonSurgicalType || null) &&
            r.doctor_type === (editing.doctorType || null)
        )
        .map((r) => r.id);
      if (dupIds.length > 0) {
        await supabase.from("branch_services").delete().in("id", dupIds);
      }

      const { error: updateErr } = await supabase.from("branch_services").update(basePayload).eq("id", editing.id);
      if (updateErr) {
        setModalError("Update failed: " + updateErr.message);
        setSaving(false);
        return;
      }
      // For other selected branches, update or insert (deduplicate by exact variant)
      const otherBranches = form.branches.filter((b) => b !== branch.name);
      if (otherBranches.length > 0) {
        const { data: branchRows } = await supabase.from("branches").select("id, name").in("name", otherBranches);
        for (const b of (branchRows ?? []) as { id: string; name: string }[]) {
          const { data: allRows } = await supabase
            .from("branch_services")
            .select("id, slimming_type, laser_type, brows_type, body_wellness_type, non_surgical_type, doctor_type")
            .eq("branch_id", b.id)
            .eq("name", editing.name);
          const matchingRows = ((allRows ?? []) as Array<{
            id: string; slimming_type: string | null; laser_type: string | null;
            brows_type: string | null; body_wellness_type: string | null; non_surgical_type: string | null; doctor_type: string | null;
          }>).filter(
            (r) =>
              r.slimming_type === (editing.slimmingType || null) &&
              r.laser_type === (editing.laserType || null) &&
              r.brows_type === (editing.browsType || null) &&
              r.body_wellness_type === (editing.bodyWellnessType || null) &&
              r.non_surgical_type === (editing.nonSurgicalType || null) &&
              r.doctor_type === (editing.doctorType || null)
          );
          if (matchingRows.length > 0) {
            await supabase.from("branch_services").update(basePayload).eq("id", matchingRows[0].id);
            if (matchingRows.length > 1) {
              await supabase.from("branch_services").delete().in("id", matchingRows.slice(1).map((r) => r.id));
            }
          } else {
            await supabase.from("branch_services").insert({ ...basePayload, branch_id: b.id });
          }
        }
      }
    } else {
      // look up UUIDs for all selected branches
      const { data: branchRows } = await supabase
        .from("branches")
        .select("id, name")
        .in("name", form.branches);

      const branchIds = (branchRows ?? []).map((b: { id: string }) => b.id);

      if (branchIds.length > 0) {
        const { data: existing } = await supabase
          .from("branch_services")
          .select("id, slimming_type, laser_type, brows_type, body_wellness_type, non_surgical_type, doctor_type, price, duration")
          .in("branch_id", branchIds)
          .eq("name", basePayload.name)
          .eq("category", basePayload.category);

        const duplicates = (
          (existing ?? []) as Array<{
            id: string;
            slimming_type: string | null;
            laser_type: string | null;
            brows_type: string | null;
            body_wellness_type: string | null;
            non_surgical_type: string | null;
            doctor_type: string | null;
            price: number | null;
            duration: string | null;
          }>
        ).filter(
          (r) =>
            r.slimming_type === basePayload.slimming_type &&
            r.laser_type === basePayload.laser_type &&
            r.brows_type === basePayload.brows_type &&
            r.body_wellness_type === basePayload.body_wellness_type &&
            r.non_surgical_type === basePayload.non_surgical_type &&
            r.doctor_type === basePayload.doctor_type &&
            r.price === basePayload.price &&
            r.duration === (basePayload.duration ?? null)
        );

        if (duplicates.length > 0) {
          setModalError(`"${basePayload.name}" already exists in one or more selected branches.`);
          setSaving(false);
          return;
        }
      }

      const rows = (branchRows ?? []).map((b: { id: string; name: string }) => ({
        ...basePayload,
        branch_id: b.id,
      }));

      if (rows.length > 0) {
        const { error: insertErr } = await supabase.from("branch_services").insert(rows);
        if (insertErr) {
          console.error("Insert error:", insertErr.message);
          setModalError("Save failed: " + insertErr.message);
          setSaving(false);
          return;
        }
      }
    }

    setSaving(false);
    setModalOpen(false);
    loadServices(branchUuid);
  }

  function handleDelete(id: string, name: string) {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  }

  async function confirmDelete(allBranches: boolean) {
    if (!confirmDeleteId || !branchUuid) return;
    if (allBranches && confirmDeleteName) {
      const { data: ref } = await supabase
        .from("branch_services")
        .select("name, category, laser_type, slimming_type, brows_type, body_wellness_type, non_surgical_type, doctor_type")
        .eq("id", confirmDeleteId)
        .single();
      if (ref) {
        const { data: candidates } = await supabase
          .from("branch_services")
          .select("id, laser_type, slimming_type, brows_type, body_wellness_type, non_surgical_type, doctor_type")
          .eq("name", ref.name as string)
          .eq("category", ref.category as string);
        const idsToDelete = (
          (candidates ?? []) as Array<{
            id: string;
            laser_type: string | null;
            slimming_type: string | null;
            brows_type: string | null;
            body_wellness_type: string | null;
            non_surgical_type: string | null;
            doctor_type: string | null;
          }>
        )
          .filter(
            (r) =>
              r.laser_type === ref.laser_type &&
              r.slimming_type === ref.slimming_type &&
              r.brows_type === ref.brows_type &&
              r.body_wellness_type === ref.body_wellness_type &&
              r.non_surgical_type === ref.non_surgical_type &&
              r.doctor_type === ref.doctor_type
          )
          .map((r) => r.id);
        if (idsToDelete.length > 0) {
          await supabase.from("branch_services").delete().in("id", idsToDelete);
        }
      }
    } else {
      await supabase.from("branch_services").delete().eq("id", confirmDeleteId);
    }
    setConfirmDeleteId(null);
    setConfirmDeleteName(null);
    loadServices(branchUuid);
  }

  async function handleSaveBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!branchUuid) { setBranchSaveError("Branch not found in database."); return; }
    setSavingBranch(true);
    setBranchSaveError(null);

    let imageUrl = branchDraft.imageUrl;
    if (branchImageFile) {
      const ext = branchImageFile.name.split(".").pop();
      const path = `branches/${branchUuid}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, branchImageFile, { upsert: true });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }
    }

    const { error: updateErr } = await supabase.from("branches").update({
      name: branchDraft.name.trim(),
      address: branchDraft.address.trim(),
      phone: branchDraft.phone.trim() || null,
      hours: branchDraft.hours.trim() || null,
      facebook: branchDraft.facebook.trim() || null,
      facebook_label: branchDraft.facebookLabel.trim() || null,
      instagram: branchDraft.instagram.trim() || null,
      instagram_label: branchDraft.instagramLabel.trim() || null,
      image_url: imageUrl,
    }).eq("id", branchUuid);

    if (updateErr) {
      setBranchSaveError(updateErr.message);
      setSavingBranch(false);
      return;
    }

    setBranchForm({ ...branchDraft, imageUrl });
    setBranchImageFile(null);
    setBranchImagePreview(null);
    setSavingBranch(false);
    setEditBranchOpen(false);
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-2 text-base text-ink/50">
          <button onClick={onBack} className="hover:text-coral-dark">Branches &amp; Services</button>
          <ChevronRight className="h-4 w-4" />
          <button onClick={onBack} className="hover:text-coral-dark">Branches</button>
          <ChevronRight className="h-4 w-4" />
          <span className="font-semibold text-ink">{branchForm.name}</span>
        </nav>
      </div>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-6 lg:flex-row">
          <div className="relative h-52 w-full shrink-0 overflow-hidden rounded-xl lg:h-auto lg:w-64">
            <Image src={branchImagePreview ?? branchForm.imageUrl} alt={branchForm.name} fill className="object-cover object-center" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold text-ink">{branchForm.name}</h2>
                <span className="rounded-full bg-green-100 px-3 py-1 text-base font-semibold text-green-700">{branch.status}</span>
              </div>
              <button onClick={() => { setBranchDraft(branchForm); setBranchImageFile(null); setBranchImagePreview(null); setEditBranchOpen(true); }} className="flex shrink-0 items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral hover:text-coral">
                <Pencil className="h-4 w-4" /> Edit Branch
              </button>
            </div>
            <div className="mt-4 space-y-2.5 text-lg text-ink/60">
              <p className="flex items-start gap-2"><MapPin className="mt-1 h-5 w-5 shrink-0 text-coral" />{branchForm.address}</p>
              <p className="flex items-center gap-2"><Phone className="h-5 w-5 text-coral" />{branchForm.phone || "+63 912 345 6789"}</p>
              <p className="flex items-center gap-2">
                <svg className="h-5 w-5 shrink-0 text-coral" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.883v2.258h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                {branchForm.facebookLabel || branchForm.facebook}
              </p>
              <p className="flex items-center gap-2">
                <svg className="h-5 w-5 shrink-0 text-coral" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                {branchForm.instagramLabel || branchForm.instagram}
              </p>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {MOCK_STATS.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-ink/8 p-4">
                  <p className="text-sm font-medium text-ink/50">{stat.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-ink">{stat.value}</p>
                </div>
              ))}
              <div className="rounded-xl border border-ink/8 p-4">
                <p className="text-sm font-medium text-ink/50">Available Staff</p>
                <p className="mt-1.5 text-2xl font-bold text-ink">{staffCount}</p>
              </div>
              <div className="rounded-xl border border-ink/8 p-4">
                <p className="text-sm font-medium text-ink/50">Services Offered</p>
                <p className="mt-1.5 text-2xl font-bold text-ink">{services.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-t border-ink/10 px-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === "Staff" && branchUuid) loadStaff(branchUuid);
              }}
              className={`shrink-0 px-5 py-4 text-lg font-medium transition-colors ${
                activeTab === tab ? "border-b-2 border-coral text-coral-dark" : "text-ink/40 hover:text-ink"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Services tab */}
      {activeTab === "Services" && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">Services ({filtered.length})</h3>
              <p className="text-base text-ink/50">Manage services offered in this branch</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                className="rounded-full border border-ink/15 px-6 py-3 text-lg text-ink/70 outline-none focus:border-coral"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <div className="flex items-center gap-2 rounded-full border border-ink/10 px-6 py-3">
                <svg className="h-5 w-5 text-ink/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search service..."
                  className="w-48 text-lg outline-none placeholder:text-ink/40"
                />
              </div>
              <button onClick={openAdd} className="flex items-center gap-2 rounded-full bg-coral px-6 py-3 text-lg font-semibold text-white hover:bg-coral-dark">
                <Plus className="h-5 w-5" /> Add Service
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-6 overflow-x-auto">
            {loadingServices && (
              <p className="py-8 text-center text-sm text-ink/40">Loading services...</p>
            )}
            {!loadingServices && grouped.length === 0 && services.length === 0 && (
              <p className="py-8 text-center text-sm text-ink/40">No services yet. Click + Add Service to get started.</p>
            )}
            {!loadingServices && grouped.length === 0 && services.length > 0 && (
              <p className="py-8 text-center text-sm text-ink/40">No services match your search.</p>
            )}
            {grouped.map((group) => {
              const groupHasDesc = group.rows.some((r) => r.description);
              const groupHasBenefits = group.rows.some((r) => r.benefits);
              return (
              <div key={group.label}>
                <table className="w-full text-base">
                  <thead>
                    <tr className="border-b border-ink/10 text-base font-semibold uppercase text-ink/40">
                      <th className="pb-3 text-left">Service</th>
                      <th className="pb-3 text-left">Department</th>
                      <th className="pb-3 text-left">Category</th>
                      {groupHasDesc && <th className="pb-3 text-left">Description</th>}
                      {groupHasBenefits && <th className="pb-3 text-left">Benefits</th>}
                      <th className="pb-3 text-left">Duration</th>
                      <th className="pb-3 text-left">{["Premium Treatments", "Laser Services", "Cocktail Drips", "Slimming Services"].includes(group.label) ? "Per Session" : "Price"}</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((svc) => (
                      <tr key={svc.id} className="border-b border-ink/5 last:border-0">
                        <td className="py-4 max-w-[260px]">
                          <p className="font-semibold text-ink">{svc.name}</p>
                          {svc.hairOptions && (
                            <p className="text-sm text-ink/50 mt-0.5">
                              {svc.hairOptions.type}{svc.hairOptions.subType ? ` · ${svc.hairOptions.subType}` : ""}
                            </p>
                          )}
                          {svc.browsType && (
                            <p className="text-sm text-ink/50 mt-0.5">{svc.browsType}</p>
                          )}
                          {svc.bodyWellnessType && (
                            <p className="text-sm text-ink/50 mt-0.5">{svc.bodyWellnessType}</p>
                          )}
                          {svc.facialOptions?.isPremium && (
                            <p className="text-sm text-ink/50 mt-0.5">Premium Facial Treatment</p>
                          )}
                          {svc.facialOptions?.hasAddons && (
                            <p className="text-sm text-ink/50 mt-0.5">Add On</p>
                          )}
                          {svc.addons && svc.addons.length > 0 && (
                            <p className="text-sm text-ink/50 mt-0.5">Add On</p>
                          )}
                          {svc.laserType && (
                            <p className="text-sm text-ink/50 mt-0.5">{svc.laserType}</p>
                          )}
                          {svc.slimmingType && (
                            <p className="text-sm text-ink/50 mt-0.5">{svc.slimmingType}</p>
                          )}
                          {svc.nonSurgicalType && (
                            <p className="text-sm text-ink/50 mt-0.5">{svc.nonSurgicalType}</p>
                          )}
                          {svc.doctorType && (
                            <p className="text-sm text-ink/50 mt-0.5">{svc.doctorType}</p>
                          )}
                        </td>
                        <td className="py-4 text-ink/60">{svc.department}</td>
                        <td className="py-4 font-semibold text-ink">{svc.category}</td>
                        {groupHasDesc && (
                          <td className="py-4 max-w-[200px]">
                            {svc.description && <p className="text-sm text-ink/50 leading-snug line-clamp-2">{svc.description}</p>}
                          </td>
                        )}
                        {groupHasBenefits && (
                          <td className="py-4 max-w-[200px]">
                            {svc.benefits && <p className="text-sm text-ink/50 leading-snug line-clamp-2">{svc.benefits}</p>}
                          </td>
                        )}
                        <td className="py-4">
                          <span className="flex items-center gap-1.5 text-ink/60">
                            <Clock className="h-4 w-4 shrink-0" />
                            {svc.duration || <span className="text-ink/30">—</span>}
                          </span>
                        </td>
                        <td className="py-4 text-sm text-ink">
                          {svc.hairOptions?.prices ? (
                            <div className="space-y-0.5">
                              <div className="flex gap-2"><span className="w-16 text-sm text-ink/40">Short</span><span className="text-sm font-semibold">₱{svc.hairOptions.prices.short || "—"}</span></div>
                              <div className="flex gap-2"><span className="w-16 text-sm text-ink/40">Medium</span><span className="text-sm font-semibold">₱{svc.hairOptions.prices.medium || "—"}</span></div>
                              <div className="flex gap-2"><span className="w-16 text-sm text-ink/40">Long</span><span className="text-sm font-semibold">₱{svc.hairOptions.prices.long || "—"}</span></div>
                            </div>
                          ) : svc.category === "Premium Treatments" ? (
                            <div className="space-y-0.5">
                              <div className="flex gap-2"><span className="w-20 text-sm text-ink/40">Per Session</span><span className="text-sm font-semibold">₱{svc.price1.toLocaleString()}.00</span></div>
                              {svc.price5 != null && <div className="flex gap-2"><span className="w-20 text-sm text-ink/40">2+1</span><span className="text-sm font-semibold">₱{svc.price5.toLocaleString()}.00</span></div>}
                            </div>
                          ) : svc.category === "Non-Surgical Liposuction" && svc.nonSurgicalType === "Add On" ? (
                            <div className="space-y-0.5">
                              <span className="text-sm font-semibold">₱{svc.price1.toLocaleString()}{svc.price5 != null ? ` – ₱${svc.price5.toLocaleString()}` : ""}</span>
                            </div>
                          ) : svc.category === "Slimming Services" ? (
                            <div className="space-y-0.5">
                              <div className="flex gap-2"><span className="w-20 text-sm text-ink/40">Per Session</span><span className="text-sm font-semibold">₱{svc.price1.toLocaleString()}.00</span></div>
                              {svc.price5 != null && <div className="flex gap-2"><span className="w-20 text-sm text-ink/40">2+1</span><span className="text-sm font-semibold">₱{svc.price5.toLocaleString()}.00</span></div>}
                            </div>
                          ) : svc.category === "Cocktail Drips" ? (
                            <div className="space-y-0.5">
                              <div className="flex gap-2"><span className="w-20 text-sm text-ink/40">Per Session</span><span className="text-sm font-semibold">₱{svc.price1.toLocaleString()}.00</span></div>
                              {svc.price5 != null && <div className="flex gap-2"><span className="w-20 text-sm text-ink/40">5+2</span><span className="text-sm font-semibold">₱{svc.price5.toLocaleString()}.00</span></div>}
                            </div>
                          ) : svc.category === "Laser Services" ? (
                            <div className="space-y-0.5">
                              {svc.laserType === "Laser Treatment" ? (
                                <div className="flex gap-2"><span className="w-24 text-sm text-ink/40">Per Body Area</span><span className="text-sm font-semibold">₱{svc.price1.toLocaleString()}.00</span></div>
                              ) : (
                                <>
                                  <div className="flex gap-2"><span className="w-20 text-sm text-ink/40">Per Session</span><span className="text-sm font-semibold">₱{svc.price1.toLocaleString()}.00</span></div>
                                  {svc.price5 != null && <div className="flex gap-2"><span className="w-20 text-sm text-ink/40">4+1</span><span className="text-sm font-semibold">₱{svc.price5.toLocaleString()}.00</span></div>}
                                </>
                              )}
                            </div>
                          ) : svc.category === "Doctor's Procedure" && svc.doctorType === "Non-Surgical Augmentation" ? (
                            <div className="space-y-0.5">
                              <div className="flex gap-2"><span className="text-sm text-ink/40">Starts at:</span><span className="text-sm font-semibold">₱{svc.price1.toLocaleString()}.00</span></div>
                            </div>
                          ) : (
                            <span className="font-semibold">₱{svc.price1.toLocaleString()}.00</span>
                          )}
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(svc)} className="rounded-lg p-2.5 text-ink/40 hover:bg-blush hover:text-coral-dark">
                              <Pencil className="h-6 w-6" />
                            </button>
                            <button onClick={() => handleDelete(svc.id, svc.name)} className="rounded-lg p-2.5 text-ink/40 hover:bg-red-50 hover:text-red-500">
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
        </div>
      )}

      {activeTab === "Staff" && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-ink">Staff Members</h3>
              <p className="text-base text-ink/40">{staffMembers.length} staff assigned to {branch.name}</p>
            </div>
          </div>
          {loadingStaff ? (
            <div className="py-12 text-center text-base text-ink/40">Loading staff...</div>
          ) : staffMembers.length === 0 ? (
            <div className="py-12 text-center text-base text-ink/40">No staff assigned to this branch yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink/10">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-ink/10 text-sm font-semibold uppercase text-ink/40">
                    <th className="px-6 py-4 text-left">Staff</th>
                    <th className="px-6 py-4 text-left">Department</th>
                    <th className="px-6 py-4 text-left">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {staffMembers.map((s) => (
                    <tr key={s.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-base font-bold text-coral-dark overflow-hidden">
                            {s.avatarUrl
                              ? <img src={s.avatarUrl} alt={s.fullName} className="h-full w-full object-cover" />
                              : s.fullName.charAt(0).toUpperCase()}
                          </span>
                          <span className="text-base font-medium text-ink">{s.fullName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-base text-ink/60">{s.department}</td>
                      <td className="px-6 py-4 text-base text-ink/60">{s.phone ?? <span className="text-ink/30">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab !== "Services" && activeTab !== "Staff" && (
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
          <p className="text-ink/40">{activeTab} — coming soon.</p>
        </div>
      )}

      {/* Duplicate Service Warning Modal */}
      {modalError && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
                <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
            </div>
            <h3 className="mb-2 text-base font-semibold text-ink">Service Already Exists</h3>
            <p className="mb-6 text-sm text-ink/60">{modalError}</p>
            <button
              type="button"
              onClick={() => setModalError(null)}
              className="w-full rounded-full bg-[#C8694A] py-2.5 text-sm font-medium text-white hover:bg-[#b85a3b] transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Service Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl max-h-[90vh]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-ink">{editing ? "Edit Service" : "Add Service"}</h2>
              <button onClick={() => { setModalOpen(false); setModalError(null); }} className="text-ink/40 hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSave}>
              {/* Service Name — full width */}
              <div className="mb-5">
                <label className="text-sm font-medium text-ink/70">Service Name <span className="text-red-500">*</span></label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral"
                  placeholder="e.g. Deep Cleansing Facial"
                />
              </div>

              {/* Hair Services — type + subtype selector */}
              {form.category === "Hair Services" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-ink/70">Service Type <span className="text-red-500">*</span></label>
                    <div className="mt-2 flex gap-3">
                      {(["Classic", "Premium"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm({ ...form, hairType: t, hairSubType: "", hairPriceShort: "", hairPriceMedium: "", hairPriceLong: "" })}
                          className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.hairType === t ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.hairType === "Premium" && (
                    <div>
                      <label className="text-sm font-medium text-ink/70">Sub Type <span className="text-red-500">*</span></label>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {HAIR_SUBTYPES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setForm({ ...form, hairSubType: s })}
                            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${form.hairSubType === s ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.hairType && (
                    <div className="grid grid-cols-3 gap-3">
                      {(["Short", "Medium", "Long"] as const).map((len) => {
                        const key = `hairPrice${len}` as "hairPriceShort" | "hairPriceMedium" | "hairPriceLong";
                        return (
                          <div key={len}>
                            <label className="text-xs font-medium uppercase text-ink/50">{len}</label>
                            <div className="relative mt-1">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">₱</span>
                              <input
                                type="text"
                                value={form[key]}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/,/g, "").replace(/[^0-9]/g, "");
                                  setForm({ ...form, [key]: raw ? Number(raw).toLocaleString() : "" });
                                }}
                                placeholder="0"
                                className="w-full rounded-lg border border-ink/15 py-2 pl-7 pr-3 text-sm outline-none focus:border-coral"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Facial Services options */}
              {form.category === "Facial Services" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4 space-y-3">
                  <label className="text-sm font-medium text-ink/70">Service Type <span className="text-ink/30">(Optional)</span></label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, facialIsPremium: !form.facialIsPremium })}
                      className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.facialIsPremium ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}
                    >
                      Premium Facial Treatment
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, facialHasAddons: !form.facialHasAddons })}
                      className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.facialHasAddons ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}
                    >
                      Add On
                    </button>
                  </div>
                </div>
              )}

              {/* Body & Wellness type selector */}
              {form.category === "Body & Wellness" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4 space-y-3">
                  <label className="text-sm font-medium text-ink/70">Service Type <span className="text-ink/30">(Optional)</span></label>
                  <div className="flex gap-3">
                    {(["Body Waxing"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, bodyWellnessType: form.bodyWellnessType === t ? "" : t })}
                        className={`rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors ${form.bodyWellnessType === t ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Laser Services type selector */}
              {form.category === "Laser Services" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4">
                  <label className="text-sm font-medium text-ink/70">Service Type <span className="text-ink/40 font-normal">(Optional)</span></label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["Pico Snow Whitening Laser", "Diode Hair Removal Laser", "IPL (Intense, Pulse, Light)", "Laser Treatment"] as const).map((t) => (
                      <button key={t} type="button"
                        onClick={() => setForm({ ...form, laserType: form.laserType === t ? "" : t, price5: "" })}
                        className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.laserType === t ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Doctor's Procedure type selector */}
              {form.category === "Doctor's Procedure" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4">
                  <label className="text-sm font-medium text-ink/70">Service Type <span className="text-ink/40 font-normal">(Optional)</span></label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["Beauty-Tox", "Non-Surgical Augmentation"] as const).map((t) => (
                      <button key={t} type="button"
                        onClick={() => setForm({ ...form, doctorType: form.doctorType === t ? "" : t })}
                        className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.doctorType === t ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Non-Surgical Liposuction type selector */}
              {form.category === "Non-Surgical Liposuction" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4">
                  <label className="text-sm font-medium text-ink/70">Service Type <span className="text-ink/40 font-normal">(Optional)</span></label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["MesoLipo", "Add On"] as const).map((t) => (
                      <button key={t} type="button"
                        onClick={() => setForm({ ...form, nonSurgicalType: form.nonSurgicalType === t ? "" : t })}
                        className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.nonSurgicalType === t ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Slimming Services type selector */}
              {form.category === "Slimming Services" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4">
                  <label className="text-sm font-medium text-ink/70">Service Type <span className="text-ink/40 font-normal">(Optional)</span></label>
                  <div className="mt-2 flex flex-col gap-2">
                    {(["7D HIFU Ultra Lift", "PowerSculpt", "Exislim / Exilift"] as const).map((t) => (
                      <button key={t} type="button"
                        onClick={() => setForm({ ...form, slimmingType: form.slimmingType === t ? "" : t, price5: "" })}
                        className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.slimmingType === t ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Brows & Lashes type selector */}
              {form.category === "Brows & Lashes" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4 space-y-3">
                  <label className="text-sm font-medium text-ink/70">Service Type <span className="text-ink/30">(Optional)</span></label>
                  <div className="flex gap-3">
                    {(["Eyelash Extensions", "Semi Permanent Tattoo"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, browsType: t })}
                        className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.browsType === t ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Nail Care add-ons */}
              {form.category === "Nail Care" && (
                <div className="mb-5 rounded-xl border border-ink/10 bg-blush/20 p-4">
                  <label className="text-sm font-medium text-ink/70">Service Type <span className="text-ink/30">(Optional)</span></label>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, nailHasAddons: !form.nailHasAddons })}
                      className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${form.nailHasAddons ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral hover:text-coral"}`}
                    >
                      Add On
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-6 sm:grid-cols-2">
                {/* Left column */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-ink/70">Department <span className="text-red-500">*</span></label>
                    <select
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral"
                    >
                      {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>

                  {form.category === "Laser Services" ? (
                    <div className="space-y-3">
                      {form.laserType === "Laser Treatment" ? (
                        <div>
                          <label className="text-sm font-medium text-ink/70">Per Body Area <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input required type="text" inputMode="numeric" value={form.price1}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price1: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm font-medium text-ink/70">Per Session <span className="text-red-500">*</span></label>
                            <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                              <span className="text-sm text-ink/50">₱</span>
                              <input required type="text" inputMode="numeric" value={form.price1}
                                onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price1: raw ? Number(raw).toLocaleString() : "" }); }}
                                placeholder="0" className="w-full text-sm outline-none" />
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-ink/70">4+1 <span className="text-red-500">*</span></label>
                            <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                              <span className="text-sm text-ink/50">₱</span>
                              <input required type="text" inputMode="numeric" value={form.price5}
                                onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price5: raw ? Number(raw).toLocaleString() : "" }); }}
                                placeholder="0" className="w-full text-sm outline-none" />
                            </div>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="text-sm font-medium text-ink/70">Duration <span className="text-ink/30">(Optional)</span></label>
                        <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral">
                          <option value="">— Select —</option>
                          {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : form.category === "Slimming Services" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-ink/70">Per Session <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input required type="text" inputMode="numeric" value={form.price1}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price1: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-ink/70">2+1 <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input required type="text" inputMode="numeric" value={form.price5}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price5: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-ink/70">Duration <span className="text-ink/30">(Optional)</span></label>
                        <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral">
                          <option value="">— Select —</option>
                          {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : form.category === "Cocktail Drips" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-ink/70">Per Session <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input required type="text" inputMode="numeric" value={form.price1}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price1: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-ink/70">5+2 <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input required type="text" inputMode="numeric" value={form.price5}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price5: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-ink/70">Duration <span className="text-ink/30">(Optional)</span></label>
                        <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral">
                          <option value="">— Select —</option>
                          {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : form.category === "Premium Treatments" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-ink/70">Per Session <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input required type="text" inputMode="numeric" value={form.price1}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price1: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-ink/70">2+1 <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input required type="text" inputMode="numeric" value={form.price5}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price5: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-ink/70">Duration <span className="text-ink/30">(Optional)</span></label>
                        <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral">
                          <option value="">— Select —</option>
                          {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : form.category === "Non-Surgical Liposuction" && form.nonSurgicalType === "Add On" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-ink/70">Price (From) <span className="text-red-500">*</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input required type="text" inputMode="numeric" value={form.price1}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price1: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-ink/70">Price (To) <span className="text-ink/40 font-normal">(Optional)</span></label>
                          <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                            <span className="text-sm text-ink/50">₱</span>
                            <input type="text" inputMode="numeric" value={form.price5}
                              onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price5: raw ? Number(raw).toLocaleString() : "" }); }}
                              placeholder="0" className="w-full text-sm outline-none" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-ink/70">Duration <span className="text-ink/30">(Optional)</span></label>
                        <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral">
                          <option value="">— Select —</option>
                          {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {form.category !== "Hair Services" && (
                    <div>
                      <label className="text-sm font-medium text-ink/70">
                        {form.category === "Doctor's Procedure" && form.doctorType === "Non-Surgical Augmentation" ? "Starts at:" : "Price"} <span className="text-red-500">*</span>
                      </label>
                      <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-2 focus-within:border-coral">
                        <span className="text-sm text-ink/50">₱</span>
                        <input required={form.category !== "Hair Services"} type="text" inputMode="numeric" value={form.price1}
                          onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price1: raw ? Number(raw).toLocaleString() : "" }); }}
                          placeholder="0" className="w-full text-sm outline-none" />
                      </div>
                    </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-ink/70">Duration <span className="text-ink/30">(Optional)</span></label>
                      <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral">
                        <option value="">— Select —</option>
                        {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-ink/70">Assigned Branches</label>
                    <div className="mt-2 space-y-2">
                      {BRANCH_OPTIONS.map((b) => {
                        const isCurrentBranch = b === branch.name;
                        return (
                          <label key={b} className="flex items-center gap-2 text-sm text-ink/70 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.branches.includes(b)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (!isCurrentBranch) {
                                    setConfirmBranch(b);
                                    return;
                                  }
                                  setForm({ ...form, branches: [...form.branches, b] });
                                } else {
                                  setForm({ ...form, branches: form.branches.filter((x) => x !== b) });
                                }
                              }}
                              className="accent-coral"
                            />
                            <span>{b}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-ink/70">Category <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-coral"
                    >
                      <option value="">— Select —</option>
                      {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-ink/70">Short Description <span className="text-ink/30">(Optional)</span></label>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Brief description of this service..."
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-ink/70">Service Benefits <span className="text-ink/30">(Optional)</span></label>
                    <textarea
                      rows={4}
                      value={form.benefits}
                      onChange={(e) => setForm({ ...form, benefits: e.target.value })}
                      placeholder="Add benefits of this service..."
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral resize-none"
                    />
                  </div>


                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-ink/10 pt-4">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-full border border-ink/15 px-6 py-2 text-sm font-medium text-ink/70 hover:border-coral">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-full bg-coral px-6 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Save Changes" : "Add Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating action panel */}
      {/* Branch warning modal */}
      {confirmBranch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mx-auto">
              <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            </div>
            <h3 className="mt-4 text-center text-lg font-semibold text-ink">Add to Another Branch?</h3>
            <p className="mt-2 text-center text-sm text-ink/50">
              This service will also be added to <span className="font-semibold text-ink">{confirmBranch}</span>.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmBranch(null)}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setForm((prev) => ({ ...prev, branches: [...prev.branches, confirmBranch!] }));
                  setConfirmBranch(null);
                }}
                className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mx-auto">
              <Trash2 className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="mt-4 text-center text-lg font-semibold text-ink">Remove Service?</h3>
            <p className="mt-2 text-center text-sm text-ink/50">Remove from this branch only, or from all branches?</p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => confirmDelete(true)}
                className="w-full rounded-full bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
              >
                Remove from All Branches
              </button>
              <button
                onClick={() => confirmDelete(false)}
                className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50"
              >
                This Branch Only
              </button>
              <button
                onClick={() => { setConfirmDeleteId(null); setConfirmDeleteName(null); }}
                className="w-full rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Branch modal */}
      {editBranchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Edit Branch</h2>
              <button onClick={() => setEditBranchOpen(false)} className="text-ink/40 hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSaveBranch} className="mt-5 space-y-4">
              {/* Photo upload */}
              <div
                className="relative h-36 w-full overflow-hidden rounded-xl cursor-pointer group"
                onClick={() => branchFileRef.current?.click()}
              >
                <Image
                  src={branchImagePreview ?? branchDraft.imageUrl}
                  alt="Branch photo"
                  fill
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ImageIcon className="h-6 w-6 text-white" />
                  <span className="text-xs font-medium text-white">Change Photo</span>
                </div>
              </div>
              <input
                ref={branchFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBranchImageFile(file);
                  setBranchImagePreview(URL.createObjectURL(file));
                  e.target.value = "";
                }}
              />
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Branch Name</label>
                <input required value={branchDraft.name} onChange={(e) => setBranchDraft({ ...branchDraft, name: e.target.value })} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral" />
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Address</label>
                <textarea rows={2} value={branchDraft.address} onChange={(e) => setBranchDraft({ ...branchDraft, address: e.target.value })} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium uppercase text-ink/40">Phone</label>
                  <input
                    value={branchDraft.phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                      let formatted = digits;
                      if (digits.startsWith("63")) {
                        const rest = digits.slice(2);
                        formatted = "+63 " + [rest.slice(0,3), rest.slice(3,6), rest.slice(6,10)].filter(Boolean).join(" ");
                      } else if (digits.startsWith("0")) {
                        const rest = digits.slice(1);
                        formatted = "0" + [rest.slice(0,3), rest.slice(3,6), rest.slice(6,10)].filter(Boolean).join(" ");
                      }
                      setBranchDraft({ ...branchDraft, phone: formatted.trim() });
                    }}
                    placeholder="+63 9XX XXX XXXX"
                    className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase text-ink/40">Hours</label>
                  <input value={branchDraft.hours} onChange={(e) => setBranchDraft({ ...branchDraft, hours: e.target.value })} placeholder="10:00 AM - 4:00 PM" className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Facebook Display Name</label>
                <input value={branchDraft.facebookLabel} onChange={(e) => setBranchDraft({ ...branchDraft, facebookLabel: e.target.value })} placeholder="e.g. Blush Spa Pagadian" className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral" />
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Instagram Display Name</label>
                <input value={branchDraft.instagramLabel} onChange={(e) => setBranchDraft({ ...branchDraft, instagramLabel: e.target.value })} placeholder="e.g. @blushrobinsons" className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral" />
              </div>
              {branchSaveError && <p className="text-sm text-red-500">{branchSaveError}</p>}
              <div className="flex gap-3 border-t border-ink/10 pt-4">
                <button type="button" onClick={() => setEditBranchOpen(false)} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">Cancel</button>
                <button type="submit" disabled={savingBranch} className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50">
                  {savingBranch ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFab && (
        <div className="fixed bottom-8 right-8 z-40 flex flex-col items-center gap-3 rounded-2xl bg-white p-4 shadow-2xl">
          <button onClick={() => setShowFab(false)} className="self-end rounded-full bg-red-50 p-1.5 text-red-400 hover:bg-red-100">
            <X className="h-4 w-4" />
          </button>
          {[
            { icon: Plus, label: "Add Service", action: openAdd, color: "text-purple-600 bg-purple-50" },
            { icon: Users, label: "Add Staff", action: () => {}, color: "text-green-600 bg-green-50" },
            { icon: ImageIcon, label: "Upload Banner", action: () => {}, color: "text-blue-600 bg-blue-50" },
            { icon: BarChart2, label: "View Analytics", action: () => {}, color: "text-coral bg-blush" },
            { icon: Settings, label: "Branch Settings", action: () => {}, color: "text-ink/60 bg-ink/5" },
          ].map(({ icon: Icon, label, action, color }) => (
            <button key={label} onClick={action} className="flex flex-col items-center gap-1 group">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} group-hover:opacity-80`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-medium text-ink/50">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
