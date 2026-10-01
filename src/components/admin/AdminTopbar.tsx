"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";

/** Live date + time (like the Front Desk header). Rendered after mount so
 * server and browser clocks can't mismatch. */
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (!now) return null;
  return (
    <div className="hidden text-right leading-tight sm:block">
      <p className="text-sm font-medium text-ink">
        {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
      </p>
      <p className="text-sm tabular-nums text-taupe">
        {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
      </p>
    </div>
  );
}

export default function AdminTopbar() {
  const { profile } = useStaffProfile();
  const name = profile?.fullName ?? "Admin User";

  return (
    <header className="flex items-center justify-between border-b border-nude/70 bg-[#FFFDF8] px-6 py-4">
      <div className="flex items-center gap-3">
        <Image
          src="/images/logo/blushnewlogo.jpeg"
          alt="Blush Spa & Aesthetics"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full object-contain"
        />
        <span className="whitespace-nowrap text-xl text-coral-dark" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          Blush Spa &amp; Aesthetics
        </span>
      </div>

      <div className="flex items-center gap-5">
        <LiveClock />
        <Link
          href="/admin/notifications"
          aria-label="Notifications"
          className="rounded-full p-2 text-ink/50 transition hover:bg-skin hover:text-coral-dark"
        >
          <Bell className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-champagne bg-skin text-base font-semibold text-coral-dark">
            {profile?.avatarUrl ? (
              <Image src={profile.avatarUrl} alt={name} fill sizes="44px" className="object-cover" />
            ) : (
              name.charAt(0)
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{name}</p>
            <p className="text-xs text-taupe">Super Administrator</p>
          </div>
        </div>
      </div>
    </header>
  );
}
