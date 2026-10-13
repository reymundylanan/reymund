import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarRange, MessageSquareHeart, Wallet } from "lucide-react";
import DateTimeChips from "@/components/admin/dashboard/DateTimeChips";
import { pesoShort } from "@/lib/adminOverview";
import type { AdminOverview as Data } from "@/lib/supabase/queries/adminOverview";

/** Good morning / afternoon / evening, by Philippine time. */
function greeting(now = new Date()): string {
  const h = Number(now.toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hour12: false })) % 24;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Admin Dashboard header: a spa photo with today's essentials and shortcuts. */
export default function WelcomeBanner({ firstName, data }: { firstName: string | null; data: Data }) {
  const k = data.kpis;
  const waiting = data.notifications.pendingBookings;
  const facts = [
    `${k.appointments.total} appointment${k.appointments.total === 1 ? "" : "s"} today`,
    `${pesoShort(k.revenue.today)} earned today`,
    waiting ? `${waiting} waiting for confirmation` : "Nothing waiting for confirmation",
  ];
  const links = [
    { href: "/admin/multi-branch", label: "Day timeline", icon: CalendarRange },
    { href: "/admin/payments", label: "Payments", icon: Wallet },
    { href: "/admin/reviews", label: "Reviews", icon: MessageSquareHeart },
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] text-white shadow-[0_24px_50px_-30px_rgba(60,35,15,0.7)]">
      <Image src="/images/about/about1.jpg" alt="" fill priority sizes="(max-width: 1024px) 100vw, 80vw" className="-z-20 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#2b1a10]/90 via-[#4a3020]/70 to-[#a8843a]/25" />

      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-champagne">Blush Spa &amp; Aesthetics · Admin</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {greeting()}
            {firstName ? `, ${firstName}` : ""} <span className="text-champagne">✨</span>
          </h1>
          <p className="mt-1.5 text-sm text-white/80">Here&apos;s what&apos;s happening across your branches today.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {facts.map((f) => (
              <li key={f} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <DateTimeChips variant="glass" />
          <div className="flex flex-wrap gap-2">
            {links.map(({ href, label, icon: I }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-champagne"
              >
                <I className="h-4 w-4 text-coral-dark" /> {label}
                <ArrowRight className="h-3.5 w-3.5 text-ink/40 transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
