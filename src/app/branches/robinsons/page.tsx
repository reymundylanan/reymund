import { createClient } from "@supabase/supabase-js";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BranchGallery from "@/components/branches/BranchGallery";
import BranchExplorer, { type DbBranchService, type BranchCategory, type BranchInfo } from "@/components/branches/BranchExplorer";

type BranchRow = { id: string; name: string; address: string; phone: string; hours: string | null; facebook: string | null; facebook_label: string | null; instagram: string | null; instagram_label: string | null };

async function fetchBranchData(branchName: string): Promise<{ info: BranchInfo; categories: BranchCategory[]; galleryPhotos: string[] }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const { data: branchRow } = await supabase
    .from("branches")
    .select("id, name, address, phone, hours, facebook, facebook_label, instagram, instagram_label")
    .eq("name", branchName)
    .maybeSingle() as { data: BranchRow | null };

  const info: BranchInfo = {
    name: branchRow?.name ?? branchName,
    area: "Robinsons Pagadian",
    address: branchRow?.address ?? "",
    phone: branchRow?.phone ?? "",
    hours: branchRow?.hours ?? "",
    facebook: branchRow?.facebook ?? "",
    facebook_label: branchRow?.facebook_label ?? "",
    instagram: branchRow?.instagram ?? "",
    instagram_label: branchRow?.instagram_label ?? "",
  };

  if (!branchRow?.id) return { info, categories: [], galleryPhotos: [] };

  const [{ data: servicesData }, { data: galleryData }] = await Promise.all([
    supabase
      .from("branch_services")
      .select("id, name, category, department, duration, price, price_41, brows_type, body_wellness_type, laser_type, slimming_type, non_surgical_type, doctor_type, hair_options, facial_options, addons")
      .eq("branch_id", branchRow.id)
      .eq("status", "Active")
      .order("category")
      .order("name"),
    supabase
      .from("branch_gallery")
      .select("image_url")
      .eq("branch_id", branchRow.id)
      .order("created_at", { ascending: false }),
  ]);

  const map = new Map<string, DbBranchService[]>();
  for (const svc of (servicesData ?? []) as DbBranchService[]) {
    if (!map.has(svc.category)) map.set(svc.category, []);
    map.get(svc.category)!.push(svc);
  }

  const categories = Array.from(map.entries()).map(([name, services]) => ({ name, services }));
  const galleryPhotos = (galleryData ?? []).map((r: { image_url: string }) => r.image_url);
  return { info, categories, galleryPhotos };
}

export default async function RobinsonsBranchPage() {
  const { info, categories, galleryPhotos } = await fetchBranchData("Robinsons Pagadian");

  return (
    <>
      <Header />
      <main className="flex-1">
        <BranchGallery
          name="Blush Spa Aesthetics - Robinsons Pagadian"
          hours={info.hours}
          photos={galleryPhotos}
        />
        <BranchExplorer defaultBranchId="robinson-mall" categories={categories} branchInfo={info} />
      </main>
      <Footer />
    </>
  );
}
