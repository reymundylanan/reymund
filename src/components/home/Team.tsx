import { User } from "lucide-react";
import { team } from "@/lib/data";

export default function Team() {
  return (
    <section id="team" className="mx-auto max-w-7xl px-6 py-20">
      <h2 className="mb-10 text-3xl font-semibold text-ink">
        Meet the <span className="text-coral">Team</span>
      </h2>

      <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        {team.map((member) => (
          <div key={member.id} className="flex flex-col items-center gap-2">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink/10 text-ink/40">
              <User className="h-8 w-8" />
            </div>
            <span className="font-medium text-ink">{member.name}</span>
            <span className="text-sm text-ink/50">{member.position}</span>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <button className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium text-ink/70 hover:border-coral hover:text-coral-dark">
          See all
        </button>
      </div>
    </section>
  );
}
