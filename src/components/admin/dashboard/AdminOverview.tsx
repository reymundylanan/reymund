import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  AlertCircle,
  Bell,
  Building2,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Flower2,
  Sparkles,
  Star,
  UserCheck,
  Users,
} from "lucide-react";
import type { AdminOverview as Data } from "@/lib/supabase/queries/adminOverview";
import { dayLabel, donutSegments, niceMax, pesoShort } from "@/lib/adminOverview";
import { formatAppointmentTime } from "@/lib/appointmentFormat";

type Icon = ComponentType<{ className?: string }>;
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

function Card({ title, icon: I, href, action, children, className = "" }: { title: string; icon: Icon; href?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-2xl border border-nude/70 bg-white p-5 shadow-[0_1px_3px_rgba(120,90,40,0.06)] ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-skin text-coral-dark">
            <I className="h-4 w-4" />
          </span>
          {title}
        </h2>
        {action ??
          (href && (
            <Link href={href} className="text-xs font-semibold text-coral-dark hover:underline">
              View All
            </Link>
          ))}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  return (
    <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-champagne bg-skin text-sm font-semibold text-coral-dark" style={{ width: size, height: size }}>
      {url ? <Image src={url} alt="" fill sizes={`${size}px`} className="object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="flex h-full min-h-20 items-center justify-center rounded-xl bg-cream text-center text-sm text-taupe">{children}</p>;
}

// ── KPI cards ───────────────────────────────────────────────────────────

function Kpis({ k }: { k: Data["kpis"] }) {
  const change = k.revenue.vsYesterday;
  const cards: { label: string; icon: Icon; value: string; note: string; href: string }[] = [
    {
      label: "Today's Appointments",
      icon: CalendarDays,
      value: String(k.appointments.total),
      note: `${k.appointments.upcoming} Upcoming • ${k.appointments.completed} Completed • ${k.appointments.cancelled} Cancelled`,
      href: "/admin/multi-branch",
    },
    {
      label: "Revenue (This Month)",
      icon: CircleDollarSign,
      value: pesoShort(k.revenue.month),
      note: `Today ${pesoShort(k.revenue.today)}${change !== null ? ` • ${change >= 0 ? "+" : ""}${change}% vs. yesterday` : ""}`,
      href: "/admin/payments",
    },
    { label: "Total Clients", icon: Users, value: k.clients.total.toLocaleString(), note: `${k.clients.returning} Returning • ${k.clients.newThisMonth} New this month`, href: "/admin/users" },
    { label: "Active Staff", icon: UserCheck, value: `${k.staff.onDuty} / ${k.staff.scheduled}`, note: `${k.staff.onDuty} On Duty • ${k.staff.notCheckedIn} Not Checked In`, href: "/admin/users" },
    { label: "Branches", icon: Building2, value: String(k.branches.count), note: k.branches.names.join(" • ") || "—", href: "/admin/branches" },
    { label: "Services", icon: Flower2, value: String(k.services.total), note: `${k.services.active} Available • ${k.services.inactive} Unavailable`, href: "/admin/branches" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {cards.map((c) => {
        const I = c.icon;
        return (
          <Link
            key={c.label}
            href={c.href}
            className="group flex flex-col rounded-2xl border border-nude/70 bg-white p-4 shadow-[0_1px_3px_rgba(120,90,40,0.06)] transition hover:-translate-y-0.5 hover:border-champagne hover:shadow-md"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-skin text-coral-dark">
                  <I className="h-5 w-5" />
                </span>
                <span className="text-[13px] font-medium text-ink/70">{c.label}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink/25 group-hover:text-coral-dark" />
            </span>
            <span className="mt-3 text-[28px] font-semibold leading-none text-ink">{c.value}</span>
            <span className="mt-2 truncate text-[11px] text-taupe" title={c.note}>
              {c.note}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ── Charts ──────────────────────────────────────────────────────────────

function RevenueChart({ points }: { points: Data["revenueChart"] }) {
  const max = niceMax(Math.max(0, ...points.map((p) => p.amount)));
  const ticks = [max, (max * 2) / 3, max / 3, 0];
  const lastIndex = points.length - 1;
  return (
    <Card title="Revenue Overview" icon={ChartColumn} action={<span className="rounded-full border border-nude px-3 py-1 text-xs text-taupe">Last 7 Days</span>}>
      <div className="flex h-56 gap-3">
        <div className="flex flex-col justify-between pb-6 text-right text-[10px] text-taupe">
          {ticks.map((t) => (
            <span key={t}>{pesoShort(t)}</span>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-3 border-b border-l border-nude/80 pb-0 pl-2">
          {points.map((p, i) => (
            <div key={p.day} className="flex h-full flex-1 flex-col items-center justify-end">
              <div
                className={`w-full max-w-10 rounded-t-md transition-all ${i === lastIndex ? "bg-coral" : "bg-champagne"}`}
                style={{ height: `${Math.max(p.amount > 0 ? 3 : 0, (p.amount / max) * 100)}%` }}
                title={`${dayLabel(p.day)}: ${pesoShort(p.amount)}`}
              />
              <span className="absolute -bottom-5 text-[10px] text-taupe" style={{ left: `calc(${((i + 0.5) / points.length) * 100}% - 14px)` }}>
                {dayLabel(p.day)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-6 text-[11px] text-taupe">Settled payments (cash and GCash) per day.</p>
    </Card>
  );
}

function AppointmentDonut({ mix }: { mix: Data["appointmentMix"] }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const segs = donutSegments(
    [
      { label: "Completed", value: mix.completed, color: "#C9A44A" },
      { label: "Upcoming", value: mix.upcoming, color: "#E8D5A5" },
      { label: "Cancelled", value: mix.cancelled, color: "#D9B98F" },
    ],
    C
  );
  const total = mix.completed + mix.upcoming + mix.cancelled;
  return (
    <Card title="Appointment Overview" icon={ClipboardList} action={<span className="text-xs text-taupe">{mix.period}</span>}>
      <div className="flex flex-wrap items-center justify-center gap-6">
        <svg viewBox="0 0 140 140" className="h-40 w-40 -rotate-90" role="img" aria-label={`${total} appointments`}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="#F5E9DC" strokeWidth="18" />
          {segs.map((s) => (
            <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="18" strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.offset} />
          ))}
          <text x="70" y="68" textAnchor="middle" className="fill-ink text-[26px] font-semibold" transform="rotate(90 70 70)">
            {total}
          </text>
          <text x="70" y="88" textAnchor="middle" className="fill-[#8A7B70] text-[11px]" transform="rotate(90 70 70)">
            Total
          </text>
        </svg>
        <ul className="space-y-3 text-sm">
          {segs.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
              <span className="w-20 text-ink/70">{s.label}</span>
              <span className="w-8 text-right font-semibold text-ink">{s.value}</span>
              <span className="text-xs text-taupe">({s.pct}%)</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

// ── Lists ───────────────────────────────────────────────────────────────

function Rating({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-taupe">No reviews</span>;
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-coral-dark">
      {value.toFixed(1)} <Star className="h-3.5 w-3.5 fill-coral text-coral" />
    </span>
  );
}

function TopServices({ list }: { list: Data["topServices"] }) {
  return (
    <Card title="Top Services" icon={Sparkles} href="/admin/branches">
      {list.length === 0 ? (
        <Empty>No bookings this month yet.</Empty>
      ) : (
        <ul className="divide-y divide-nude/60">
          {list.map((s) => (
            <li key={s.name} className="flex items-center gap-3 py-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-skin text-coral-dark">
                <Flower2 className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{s.name}</span>
                <span className="block text-xs text-taupe">{s.bookings} bookings this month</span>
              </span>
              <Rating value={s.rating} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BranchPerformance({ list }: { list: Data["branchPerformance"] }) {
  return (
    <Card title="Branch Performance" icon={Building2} href="/admin/branches">
      {list.length === 0 ? (
        <Empty>No branches yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {list.map((b) => (
            <li key={b.id} className="rounded-xl border border-nude/70 p-3">
              <p className="text-sm font-semibold text-ink">{b.name}</p>
              <p className="text-xs text-taupe">
                {b.appointments} appointments • {pesoShort(b.revenue)} revenue
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-skin">
                  <div className="h-full rounded-full bg-coral" style={{ width: `${b.share}%` }} />
                </div>
                <span className="w-9 text-right text-xs text-taupe">{b.share}%</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-taupe">This month · share of appointments</p>
    </Card>
  );
}

function TopStaff({ list }: { list: Data["topStaff"] }) {
  return (
    <Card title="Top Staff" icon={UserCheck} href="/admin/users">
      {list.length === 0 ? (
        <Empty>No staff appointments this month yet.</Empty>
      ) : (
        <ul className="divide-y divide-nude/60">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={s.name} url={s.avatarUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{s.name}</span>
                <span className="block truncate text-xs text-taupe">{s.department ?? "Staff"}</span>
              </span>
              <span className="w-14 text-right text-xs text-ink/70">{s.appointments} appt.</span>
              <Rating value={s.rating} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentActivity({ list }: { list: Data["activity"] }) {
  return (
    <Card title="Recent Activity" icon={CalendarDays} href="/admin/multi-branch">
      {list.length === 0 ? (
        <Empty>No recent activity.</Empty>
      ) : (
        <ul className="space-y-3">
          {list.slice(0, 6).map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-coral" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm text-ink/80">{a.text}</span>
                <span className="block text-[11px] text-taupe">{a.time}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Notifications({ n }: { n: Data["notifications"] }) {
  const items = [
    { show: n.pendingGcash > 0, text: `${n.pendingGcash} GCash ${n.pendingGcash === 1 ? "payment needs" : "payments need"} verification`, href: "/admin/payments", tone: "bg-amber-400" },
    { show: n.pendingBookings > 0, text: `${n.pendingBookings} ${n.pendingBookings === 1 ? "booking is" : "bookings are"} waiting for confirmation`, href: "/admin/multi-branch", tone: "bg-coral" },
    { show: n.flaggedReviews > 0, text: `${n.flaggedReviews} flagged ${n.flaggedReviews === 1 ? "review" : "reviews"} to check`, href: "/admin/reviews?status=flagged", tone: "bg-red-400" },
    { show: n.newReviews > 0, text: `${n.newReviews} new ${n.newReviews === 1 ? "review" : "reviews"}`, href: "/admin/reviews?status=new", tone: "bg-champagne" },
    { show: n.staffNotCheckedIn > 0, text: `${n.staffNotCheckedIn} staff ${n.staffNotCheckedIn === 1 ? "member has" : "members have"} not checked in`, href: "/admin/users", tone: "bg-nude" },
  ].filter((i) => i.show);
  return (
    <Card title="Important Notifications" icon={Bell} href="/admin/notifications">
      {items.length === 0 ? (
        <Empty>All clear — nothing needs attention.</Empty>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.text}>
              <Link href={i.href} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-ink/80 hover:bg-cream">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i.tone} text-white`}>
                  <AlertCircle className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">{i.text}</span>
                <ChevronRight className="h-4 w-4 text-ink/25" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const STATE_BADGE: Record<string, { label: string; style: string }> = {
  upcoming: { label: "Upcoming", style: "bg-skin text-coral-dark" },
  confirmed: { label: "Confirmed", style: "bg-amber-100 text-amber-700" },
  in_service: { label: "In Service", style: "bg-green-100 text-green-700" },
  completed: { label: "Completed", style: "bg-green-50 text-green-700" },
  cancelled: { label: "Cancelled", style: "bg-red-50 text-red-600" },
  no_show: { label: "No Show", style: "bg-red-50 text-red-600" },
};

function TodayAppointments({ list }: { list: Data["todayAppointments"] }) {
  return (
    <Card title="Today's Appointments" icon={CalendarDays} href="/admin/multi-branch">
      {list.length === 0 ? (
        <Empty>No appointments today.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-nude/70">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-cream text-[11px] font-semibold uppercase tracking-wide text-taupe">
              <tr>
                <th className="px-4 py-2.5">Time</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5">Price</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nude/60">
              {list.map((a) => {
                const badge = STATE_BADGE[a.state === "upcoming" && a.confirmed ? "confirmed" : a.state];
                return (
                  <tr key={a.id} className="hover:bg-cream/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink/70">{formatAppointmentTime(a.time)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={a.client} url={a.clientAvatar} size={30} />
                        <span className="font-medium text-ink">{a.client}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{a.service}</td>
                    <td className="px-4 py-3 text-ink/70">{a.staff}</td>
                    <td className="px-4 py-3 text-ink/70">{a.branch}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink/80">{a.price != null ? pesoShort(a.price) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${badge.style}`}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Tagline() {
  return (
    <div className="flex flex-col justify-center rounded-2xl border border-nude/70 bg-gradient-to-br from-skin via-cream to-champagne/60 p-6">
      <p className="text-2xl italic leading-snug text-coral-dark" style={SERIF}>
        Better Systems
        <br />
        for a More Beautiful
        <br />
        Tomorrow
      </p>
      <Flower2 className="mt-3 h-6 w-6 text-coral" />
    </div>
  );
}

export default function AdminOverview({ data }: { data: Data }) {
  return (
    <div className="space-y-6">
      <Kpis k={data.kpis} />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr_1fr]">
        <RevenueChart points={data.revenueChart} />
        <AppointmentDonut mix={data.appointmentMix} />
        <TopServices list={data.topServices} />
      </div>
      <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
        <BranchPerformance list={data.branchPerformance} />
        <TopStaff list={data.topStaff} />
        <RecentActivity list={data.activity} />
        <Notifications n={data.notifications} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <TodayAppointments list={data.todayAppointments} />
        <Tagline />
      </div>
    </div>
  );
}
