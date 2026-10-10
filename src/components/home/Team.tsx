import { createClient } from "@/lib/supabase/server";
import { getDepartmentCategories, getPublicStaffList } from "@/lib/supabase/queries/staffProfiles";
import SectionHeading from "@/components/SectionHeading";
import TeamGrid from "@/components/home/TeamGrid";

export default async function Team() {
  const supabase = await createClient();
  const [staff, categories] = await Promise.all([getPublicStaffList(supabase), getDepartmentCategories(supabase)]);

  return (
    <section id="team" className="mx-auto max-w-7xl px-6 py-20">
      <SectionHeading
        eyebrow="Our Experts"
        title="Meet the Team"
        subtitle="Skilled, caring specialists dedicated to your glow. Tap anyone and GlowSync AI will introduce them."
      />

      {staff.length === 0 ? (
        <p className="text-sm text-ink/50">Our team will be introduced here soon.</p>
      ) : (
        <TeamGrid staff={staff} categories={categories} />
      )}
    </section>
  );
}
