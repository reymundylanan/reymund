import { aboutLocations, branchContacts } from "@/lib/data";
import { branchPitch, type BranchStats } from "@/lib/branchGuide";
import { getBranchStats } from "@/lib/supabase/queries/branchStats";
import LocationsGrid, { type LocationCard } from "@/components/about/LocationsGrid";

// Each About-page location ↔ its branch in the database, booking id and page.
const LINKS: Record<string, { branch: string; place: string; kind: BranchStats["kind"]; href: string; booking: string }> = {
  "one-cecilia-center": { branch: "One Cecilia Center", place: "One Cecilia Center", kind: "flagship", href: "/branches/pagadian", booking: "one-cecilia-center" },
  "robinson-pagadian": { branch: "Robinsons Pagadian", place: "Robinsons Mall", kind: "mall", href: "/branches/robinsons", booking: "robinson-mall" },
};

export default async function Locations() {
  const known = aboutLocations.filter((l) => LINKS[l.id]);
  const stats = await getBranchStats(known.map((l) => ({ name: LINKS[l.id].branch, place: LINKS[l.id].place, kind: LINKS[l.id].kind })));
  const cards: LocationCard[] = known.map((l) => {
    const link = LINKS[l.id];
    const s = stats[link.branch];
    return {
      id: l.id,
      name: l.name,
      subtitle: l.subtitle,
      description: l.description,
      image: l.image,
      href: link.href,
      bookingBranchId: branchContacts.some((b) => b.id === link.booking) ? link.booking : null,
      stats: s,
      pitch: branchPitch(s),
    };
  });

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold text-ink">
          Our <span className="text-coral">Premier</span> Locations
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-ink/60">
          Visit us at our strategically located branches in the heart of Pagadian City. Point at (or tap) a branch and GlowSync AI will show you around.
        </p>
        <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-coral" />
      </div>
      <LocationsGrid locations={cards} />
    </section>
  );
}
