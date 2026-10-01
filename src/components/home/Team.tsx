import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPublicStaffList } from "@/lib/supabase/queries/staffProfiles";
import SectionHeading from "@/components/SectionHeading";

export default async function Team() {
  const supabase = await createClient();
  const staff = await getPublicStaffList(supabase);

  return (
    <section id="team" className="mx-auto max-w-7xl px-6 py-20">
      <SectionHeading eyebrow="Our Experts" title="Meet the Team" subtitle="Skilled, caring specialists dedicated to your glow." />

      {staff.length === 0 ? (
        <p className="text-sm text-ink/50">Our team will be introduced here soon.</p>
      ) : (
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {staff.map((m) => (
            <Link key={m.id} href={`/team/${m.id}`} className="group flex flex-col items-center gap-2 text-center">
              <span className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-blush text-2xl font-bold text-coral-dark">
                {m.avatarUrl ? (
                  <Image src={m.avatarUrl} alt={m.fullName} fill sizes="80px" className="object-cover" />
                ) : (
                  m.fullName.charAt(0).toUpperCase()
                )}
              </span>
              <span className="font-medium text-ink group-hover:text-coral-dark">{m.fullName}</span>
              <span className="text-sm text-ink/50">
                {m.department}
                {m.branchName && <> · {m.branchName}</>}
              </span>
              <span className="flex items-center gap-1 text-xs text-ink/60">
                {m.count > 0 ? (
                  <>
                    <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {m.average} · {m.count} review{m.count === 1 ? "" : "s"}
                  </>
                ) : (
                  "No reviews yet"
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
