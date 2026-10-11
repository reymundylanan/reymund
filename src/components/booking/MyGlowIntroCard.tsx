"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Gift, Star } from "lucide-react";
import { GUIDE_FONTS, TypeText } from "@/components/guide/guideKit";
import { PlayfulMascot } from "@/components/guide/MascotPlay";
import { createClient } from "@/lib/supabase/client";
import { hasSeenMyGlowTour } from "@/lib/myGlowIntro";

const POINTS = [
  { icon: CalendarCheck, text: "Follow this booking — you'll see when it's confirmed" },
  { icon: Star, text: "After your visit, tap “Rate & Review” to share how it went" },
  { icon: Gift, text: "Reviews earn GlowPoints you can trade for vouchers" },
];

/** After booking, GlowSync AI tells the client where their booking, records
 * and reviews live. Clients who haven't had the My Glow tour get the full
 * introduction; everyone else a one-line reminder. */
export default function MyGlowIntroCard({ onNavigate }: { onNavigate: () => void }) {
  const [firstTime, setFirstTime] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => alive && setFirstTime(data.user ? !hasSeenMyGlowTour(data.user.id) : false));
    return () => {
      alive = false;
    };
  }, []);

  if (firstTime == null) return null;

  if (!firstTime) {
    return (
      <p className="rounded-2xl bg-[#fff8e8] px-4 py-3 text-center text-sm text-ink/70 ring-1 ring-[#f1dfb6]">
        Your booking is saved in{" "}
        <Link href="/my-glow#my-bookings" onClick={onNavigate} className="font-semibold text-coral-dark underline-offset-2 hover:underline">
          My Glow
        </Link>{" "}
        — review your visit there afterwards to earn GlowPoints.
      </p>
    );
  }

  return (
    <div className={`guide-bubble glowy-pop ${GUIDE_FONTS}`}>
      <div className="guide-bubble-inner flex gap-3 p-4">
        <div className="relative hidden shrink-0 self-end sm:block">
          <PlayfulMascot size={112} pose="present" label="Play with GlowSync AI" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="guide-rise flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">
            <span aria-hidden className="guide-live-dot" />
            GlowSync AI · Your first booking
          </p>
          <p className="guide-rise guide-display guide-title text-[18px] leading-tight">Everything is saved in My Glow!</p>
          <p className="guide-rise text-[13.5px] font-semibold leading-relaxed text-ink/85">
            <TypeText text="My Glow is your personal page — find it any time in the top menu. There you can:" />
          </p>
          <ul className="guide-rise space-y-1.5">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2 text-[13px] leading-snug text-ink/75">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a97c1c]" aria-hidden /> {text}
              </li>
            ))}
          </ul>
          <Link
            href="/my-glow?tour=1"
            onClick={onNavigate}
            className="guide-rise inline-flex rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] px-4 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(169,124,28,0.8)] transition hover:-translate-y-0.5 hover:brightness-105"
          >
            Show me My Glow →
          </Link>
        </div>
      </div>
    </div>
  );
}
