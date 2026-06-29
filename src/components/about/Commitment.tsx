import {
  Award,
  CheckCircle2,
  FileCheck2,
  Heart,
  Settings,
  Smile,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { coreValues, trustBadges } from "@/lib/data";

const valueIcons = [Award, Heart, Settings, Smile, Sparkles, Users];
const trustIcons = [CheckCircle2, FileCheck2, Trophy, CheckCircle2];

export default function Commitment() {
  return (
    <section className="bg-blush px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-ink">
            The <span className="text-coral">Blush</span> Commitment
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-ink/60">
            Our core values define the quality and heart we put into every
            aesthetic session.
          </p>
          <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-coral" />
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {coreValues.map((value, i) => {
            const Icon = valueIcons[i % valueIcons.length];
            return (
              <div
                key={value.id}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush text-coral-dark">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold text-ink">{value.title}</h3>
                <p className="mt-2 text-sm text-ink/60">
                  {value.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-2xl bg-white px-8 py-6">
          {trustBadges.map((badge, i) => {
            const Icon = trustIcons[i % trustIcons.length];
            return (
              <span
                key={badge}
                className="flex items-center gap-2 text-sm font-medium text-ink/70"
              >
                <Icon className="h-4 w-4 text-coral-dark" />
                {badge}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
