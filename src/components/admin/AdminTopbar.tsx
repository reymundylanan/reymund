"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays } from "lucide-react";
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
    <div className="hidden items-center gap-2.5 rounded-full bg-white px-4 py-2 ring-1 ring-[#efe3c6] lg:flex">
      <CalendarDays className="h-4 w-4 text-coral-dark" />
      <span className="text-sm font-medium text-ink">
        {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </span>
      <span className="h-4 w-px bg-ink/10" />
      <span className="text-sm tabular-nums text-ink/60">
        {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  );
}

/** The section the Admin is in, from the sidebar's pages (longest match wins). */
const SECTIONS: [string, string, string][] = [
  ["/admin/users", "Users & Roles", "Staff, front desk and client accounts"],
  ["/admin/payments", "Payments & Financials", "Online and cash payments, verification and transactions"],
  ["/admin/branches", "Branches & Services", "Locations, services, promotions and staff"],
  ["/admin/multi-branch", "Multi-Branch", "Staff, bookings and walk-ins across branches"],
  ["/admin/branch-board", "Multi-Branch", "Staff, bookings and walk-ins across branches"],
  ["/admin/notifications", "Notifications", "Broadcasts, website announcement and client feedback"],
  ["/admin/reviews", "Reviews", "Client ratings, replies and rewards"],
  ["/admin/reports", "Reports", "Sales, staff, services and client reports"],
];

function useSection(pathname: string) {
  const hit = SECTIONS.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
  return hit ? { title: hit[1], hint: hit[2] } : { title: "Dashboard", hint: "Today across every branch" };
}

export default function AdminTopbar() {
  const { profile } = useStaffProfile();
  const name = profile?.fullName ?? "Admin User";
  const section = useSection(usePathname() ?? "/admin");

  return (
    <header className="flex items-center justify-between gap-4 border-b border-nude/70 bg-[#FFFDF8]/90 px-6 py-3.5 backdrop-blur">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-coral-dark">Admin</p>
        <p className="truncate text-lg font-semibold leading-tight text-ink">{section.title}</p>
        <p className="hidden truncate text-xs text-ink/50 md:block">{section.hint}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        <LiveClock />
        <Link
          href="/admin/notifications"
          aria-label="Notifications"
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink/55 ring-1 ring-[#efe3c6] transition hover:text-coral-dark hover:ring-coral/50"
        >
          <Bell className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3 rounded-full bg-white py-1 pl-1 pr-1 ring-1 ring-[#efe3c6] md:pr-4">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-champagne bg-skin text-base font-semibold text-coral-dark">
            {profile?.avatarUrl ? (
              <Image src={profile.avatarUrl} alt={name} fill sizes="36px" className="object-cover" />
            ) : (
              name.charAt(0)
            )}
          </span>
          <div className="hidden leading-tight md:block">
            <p className="text-sm font-semibold text-ink">{name}</p>
            <p className="text-[11px] text-taupe">Super Administrator</p>
          </div>
        </div>
      </div>
    </header>
  );
}
