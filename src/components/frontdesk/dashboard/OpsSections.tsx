"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Clock,
  CreditCard,
  Flower2,
  ReceiptText,
  UserCheck,
  UserRound,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import {
  formatClock,
  formatElapsed,
  peso,
  scheduleLabel,
  visitHref,
  type Alert,
  type Ops,
  type StaffState,
} from "@/lib/frontdeskOps";

type Icon = ComponentType<{ className?: string }>;

// ── Shared pieces ───────────────────────────────────────────────────────

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

/** Photo when it's stored in our Supabase bucket (allowed by next.config),
 * otherwise the first letter. */
function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  let ok = false;
  try {
    ok = !!url && !!SUPABASE_HOST && new URL(url).host === SUPABASE_HOST;
  } catch {
    ok = false;
  }
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-semibold text-coral-dark"
      style={{ width: size, height: size }}
    >
      {ok ? <Image src={url as string} alt="" fill sizes={`${size}px`} className="object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

function SectionIcon({ icon: IconCmp }: { icon: Icon }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blush">
      <IconCmp className="h-4.5 w-4.5 text-coral-dark" />
    </span>
  );
}

function Card({
  title,
  subtitle,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon: Icon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-ink/5 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionIcon icon={icon} />
          <div>
            <h2 className="font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-ink/50">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

function ViewLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-0.5 pt-1 text-xs font-semibold text-ink/60 hover:text-coral-dark">
      {children} <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="flex h-full min-h-24 items-center justify-center rounded-xl bg-blush/40 px-4 text-center text-sm text-ink/40">{children}</p>;
}

const ROW = "flex items-center gap-3 rounded-xl border border-ink/5 p-3 transition hover:border-coral/40 hover:bg-blush/40";

const BADGE: Record<string, string> = {
  Upcoming: "bg-blue-50 text-blue-600",
  Confirmed: "bg-amber-50 text-amber-700",
  Waiting: "bg-amber-50 text-amber-700",
  "In Service": "bg-green-50 text-green-700",
  Completed: "bg-ink/5 text-ink/60",
  Cancelled: "bg-ink/5 text-ink/40",
  "No Show": "bg-red-50 text-red-600",
};

function Badge({ label }: { label: string }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${BADGE[label] ?? "bg-ink/5 text-ink/50"}`}>{label}</span>
  );
}

const STAFF_STATE: Record<StaffState, { label: string; pill: string; dot: string }> = {
  available: { label: "Available", pill: "bg-green-50 text-green-700", dot: "bg-green-500" },
  in_service: { label: "In Service", pill: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  on_break: { label: "On Break", pill: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  not_checked_in: { label: "Not Checked In", pill: "bg-ink/5 text-ink/50", dot: "bg-ink/25" },
  out: { label: "Checked Out", pill: "bg-ink/5 text-ink/50", dot: "bg-ink/40" },
  off: { label: "Day Off", pill: "bg-ink/5 text-ink/40", dot: "bg-ink/15" },
};

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`} aria-hidden />;
}

function dotList(parts: [number, string][]) {
  return parts
    .filter(([n], i) => n > 0 || i === 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" • ");
}

function duration(minutes: number) {
  return `${minutes} min`;
}

// ── 1. Overview ────────────────────────────────────────────────────────

export function OverviewCards({ ops }: { ops: Ops }) {
  const cards: { label: string; icon: Icon; tint: string; iconTint: string; value: string; note: string; href: string }[] = [
    {
      label: "Today's Appointments",
      icon: CalendarDays,
      tint: "bg-white",
      iconTint: "bg-blush text-coral-dark",
      value: `${ops.appointments.total}`,
      note: [`${ops.appointments.upcoming} Upcoming`, `${ops.appointments.completed} Completed`, `${ops.appointments.cancelled} Cancelled`].join(" • "),
      href: "/frontdesk/appointments",
    },
    {
      label: "Walk-Ins",
      icon: UserRound,
      tint: "bg-blue-50/40",
      iconTint: "bg-blue-50 text-blue-600",
      value: `${ops.walkins.total}`,
      note: [`${ops.walkins.waiting} Waiting`, `${ops.walkins.inService} In Service`, `${ops.walkins.completed} Completed`].join(" • "),
      href: "/frontdesk/walk-ins",
    },
    {
      label: "Staff On Duty",
      icon: UserCheck,
      tint: "bg-green-50/40",
      iconTint: "bg-green-50 text-green-600",
      value: `${ops.staff.onDuty} / ${ops.staff.scheduled}`,
      note: [`${ops.staff.available} Available`, `${ops.staff.inService} In Service`].join(" • "),
      href: "/frontdesk/staff",
    },
    {
      label: "Staff Scheduled",
      icon: CalendarCheck,
      tint: "bg-indigo-50/40",
      iconTint: "bg-indigo-50 text-indigo-600",
      value: `${ops.staff.scheduled}`,
      note: [`${ops.staff.checkedIn} Checked In`, `${ops.staff.notCheckedIn} Not Checked In`].join(" • "),
      href: "/frontdesk/staff",
    },
    {
      label: "Pending Payments",
      icon: CreditCard,
      tint: "bg-red-50/40",
      iconTint: "bg-red-50 text-red-500",
      value: peso(ops.payments.total),
      note: `${ops.payments.count} Awaiting Verification`,
      href: "/frontdesk/payments",
    },
    {
      label: "Clients Today",
      icon: UsersRound,
      tint: "bg-sky-50/40",
      iconTint: "bg-sky-50 text-sky-600",
      value: `${ops.clients.total}`,
      note: [`${ops.clients.returning} Returning`, `${ops.clients.new} New`].join(" • "),
      href: "/frontdesk/clients",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {cards.map((c) => {
        const IconCmp = c.icon;
        return (
          <Link
            key={c.label}
            href={c.href}
            className={`group flex flex-col rounded-2xl border border-ink/5 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-coral/40 hover:shadow-md ${c.tint}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${c.iconTint}`}>
                  <IconCmp className="h-4 w-4" />
                </span>
                {c.label}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink/25 transition group-hover:text-coral-dark" />
            </span>
            <span className="mt-3 text-3xl font-semibold text-ink">{c.value}</span>
            <span className="mt-2 text-[11px] text-ink/50">{c.note}</span>
          </Link>
        );
      })}
    </div>
  );
}

// ── 2. Today's Schedule (table) ────────────────────────────────────────

export function TodayScheduleCard({ ops, branchName }: { ops: Ops; branchName: string | null }) {
  const router = useRouter();
  return (
    <Card
      title="Today's Schedule"
      subtitle={`Live appointments and services${branchName ? ` for ${branchName}` : ""}`}
      icon={CalendarDays}
      action={<ViewLink href="/frontdesk/appointments">View Full Schedule</ViewLink>}
    >
      {ops.schedule.length === 0 ? (
        <Empty>No appointments scheduled for today.</Empty>
      ) : (
        <div className="max-h-[30rem] overflow-auto rounded-xl border border-ink/5">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-blush/60 text-xs font-semibold text-ink/60 backdrop-blur">
              <tr>
                <th className="px-3 py-2.5">Time</th>
                <th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5">Service</th>
                <th className="px-3 py-2.5">Staff</th>
                <th className="px-3 py-2.5">Duration</th>
                <th className="px-3 py-2.5">Price</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="w-8" aria-hidden />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {ops.schedule.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => router.push(visitHref(v))}
                  className="cursor-pointer transition hover:bg-blush/40"
                >
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ink/60">{formatClock(v.startTime)}</td>
                  <td className="px-3 py-3">
                    <Link href={visitHref(v)} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 font-medium text-ink hover:text-coral-dark">
                      <Avatar name={v.clientName} url={v.clientAvatar} size={30} />
                      <span className="truncate">{v.clientName}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block text-ink">{v.serviceName}</span>
                    <span className="block text-[11px] text-ink/40">{duration(v.durationMinutes)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink/70">{v.professionalName || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink/60">{duration(v.durationMinutes)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink/80">{v.price != null ? peso(v.price) : "—"}</td>
                  <td className="px-3 py-3">
                    <Badge label={scheduleLabel(v)} />
                  </td>
                  <td className="pr-3 text-ink/30">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── 3. Staff On Duty ───────────────────────────────────────────────────

export function StaffOnDutyCard({ ops }: { ops: Ops }) {
  const s = ops.staff;
  const order: StaffState[] = ["in_service", "available", "on_break", "not_checked_in", "out", "off"];
  const cards = [...s.cards].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.name.localeCompare(b.name));

  return (
    <Card
      title="Staff On Duty"
      subtitle={`${s.onDuty} / ${s.scheduled} on duty`}
      icon={Users}
      action={<ViewLink href="/frontdesk/staff">View All</ViewLink>}
    >
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
        <span className="flex items-center gap-1.5"><Dot className="bg-green-500" /> {s.available} Available</span>
        <span className="flex items-center gap-1.5"><Dot className="bg-blue-500" /> {s.inService} In Service</span>
        <span className="flex items-center gap-1.5"><Dot className="bg-amber-400" /> {s.onBreak} On Break</span>
        <span className="flex items-center gap-1.5"><Dot className="bg-ink/25" /> {s.notCheckedIn} Not Checked In</span>
      </div>

      {cards.length === 0 ? (
        <Empty>No staff assigned to this branch yet.</Empty>
      ) : (
        <ul className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
          {cards.map((m) => {
            const st = STAFF_STATE[m.state];
            return (
              <li key={m.id}>
                <Link
                  href={`/frontdesk/staff?staff=${m.id}`}
                  className={`flex items-center gap-3 rounded-xl border border-ink/5 p-3 transition hover:border-coral/40 hover:bg-blush/40 ${m.state === "off" ? "opacity-60" : ""}`}
                >
                  <Avatar name={m.name} url={m.avatarUrl} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{m.name}</span>
                    {m.department && <span className="block truncate text-xs text-ink/50">{m.department}</span>}
                    <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.pill}`}>
                      <Dot className={st.dot} /> {st.label}
                    </span>
                  </span>
                  <span className="hidden min-w-0 shrink-0 text-xs sm:block">
                    <span className="block text-ink/70">
                      Today&apos;s Schedule: <span className="font-semibold text-ink">{m.total}</span>
                    </span>
                    {m.total > 0 && (
                      <span className="block text-ink/45">
                        {dotList([
                          [m.completed, "Completed"],
                          [m.inService, "In Service"],
                          [m.upcoming, "Upcoming"],
                        ])}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs font-medium text-ink/70">
                    View <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── 4. Currently In Service ────────────────────────────────────────────

export function InServiceCard({ ops }: { ops: Ops }) {
  const n = ops.inService.length;
  return (
    <Card title="Currently In Service" icon={Flower2} action={<span className="pt-1 text-xs font-semibold text-ink/60">{n} {n === 1 ? "client" : "clients"}</span>}>
      {n === 0 ? (
        <Empty>No one is in service right now.</Empty>
      ) : (
        <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
          {ops.inService.map(({ visit: v, elapsedMs, remainingMinutes, overdue }) => (
            <li key={v.id}>
              <Link
                href={visitHref(v)}
                className={`block rounded-xl border p-3 transition hover:shadow-sm ${overdue ? "border-red-200 bg-red-50/50" : "border-green-200 bg-green-50/50"}`}
              >
                <span className="flex items-center gap-3">
                  <Avatar name={v.clientName} url={v.clientAvatar} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{v.clientName}</span>
                    <span className="block truncate text-xs text-ink/50">
                      {v.serviceName} • {duration(v.durationMinutes)}
                    </span>
                    {v.professionalName && (
                      <span className="flex items-center gap-1 text-xs text-ink/50">
                        <UserRound className="h-3 w-3" /> {v.professionalName}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink/30" />
                </span>
                <span className={`mt-3 flex items-center justify-between border-t pt-2 text-sm ${overdue ? "border-red-200" : "border-green-200"}`}>
                  <span className={`flex items-center gap-1.5 font-semibold ${overdue ? "text-red-600" : "text-green-700"}`}>
                    <Clock className="h-4 w-4" /> {formatElapsed(elapsedMs)} elapsed
                  </span>
                  <span className={overdue ? "font-semibold text-red-600" : "text-ink/70"}>
                    {overdue ? `${-remainingMinutes} min over` : `${remainingMinutes} min remaining`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 5. Waiting Queue ───────────────────────────────────────────────────

export function WaitingQueueCard({ ops }: { ops: Ops }) {
  const n = ops.waiting.length;
  return (
    <Card
      title="Waiting Queue"
      subtitle={`${n} ${n === 1 ? "customer" : "customers"} waiting`}
      icon={UsersRound}
      action={<ViewLink href="/frontdesk/appointments">Manage Queue</ViewLink>}
    >
      {n === 0 ? (
        <Empty>No customers waiting</Empty>
      ) : (
        <ul className="max-h-80 divide-y divide-ink/5 overflow-y-auto rounded-xl border border-ink/5">
          {ops.waiting.map(({ visit: v, waitingMinutes }, i) => (
            <li key={v.id}>
              <Link href={visitHref(v)} className="flex items-center gap-3 p-3 transition hover:bg-blush/40">
                <span className="w-6 shrink-0 text-xs font-bold text-ink/60">#{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{v.clientName}</span>
                  <span className="block truncate text-xs text-ink/50">
                    {v.serviceName} • {duration(v.durationMinutes)}
                  </span>
                </span>
                <Badge label="Waiting" />
                <span className="w-12 shrink-0 text-right text-xs font-medium text-ink/70">{waitingMinutes} min</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 6. Coming Up Next ──────────────────────────────────────────────────

export function ComingUpCard({ ops }: { ops: Ops }) {
  return (
    <Card title="Coming Up Next" icon={Clock} action={<ViewLink href="/frontdesk/appointments">View Appointments</ViewLink>}>
      {ops.comingUp.length === 0 ? (
        <Empty>No more appointments today.</Empty>
      ) : (
        <ul className="divide-y divide-ink/5 rounded-xl border border-ink/5">
          {ops.comingUp.map((v) => (
            <li key={v.id}>
              <Link href={visitHref(v)} className="flex items-center gap-3 p-3 transition hover:bg-blush/40">
                <span className="w-16 shrink-0 text-xs font-semibold text-ink/70">{formatClock(v.startTime)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{v.clientName}</span>
                  <span className="block truncate text-xs text-ink/50">
                    {v.serviceName}
                    {v.professionalName ? ` • ${v.professionalName}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink/30" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 7. Payments to Verify ──────────────────────────────────────────────

function paymentWhen(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PaymentsToVerifyCard({ ops }: { ops: Ops }) {
  const p = ops.payments;
  return (
    <Card
      title="Payments to Verify"
      subtitle={`${p.count} ${p.count === 1 ? "transaction" : "transactions"} • ${peso(p.total)} total`}
      icon={Wallet}
      action={<ViewLink href="/frontdesk/payments">View All</ViewLink>}
    >
      {p.count === 0 ? (
        <p className="flex min-h-24 items-center justify-center gap-2 rounded-xl bg-green-50 text-sm text-green-700">
          <CircleCheck className="h-4 w-4" /> All payments verified
        </p>
      ) : (
        <ul className="max-h-64 divide-y divide-ink/5 overflow-y-auto rounded-xl border border-ink/5">
          {p.items.map((item) => (
            <li key={item.id}>
              <Link href="/frontdesk/payments" className={`${ROW} rounded-none border-0`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ReceiptText className="h-4 w-4" />
                </span>
                <span className="w-28 shrink-0 text-xs text-ink/70">
                  {item.method.toLowerCase() === "gcash" ? "GCash" : item.method} • +{peso(item.amount)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{item.clientName}</span>
                  <span className="block text-[11px] text-ink/40">{paymentWhen(item.createdAt)}</span>
                </span>
                <span className="hidden shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 sm:inline">
                  Needs Verification
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink/30" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 8. Needs Attention ─────────────────────────────────────────────────

const TONE: Record<Alert["tone"], string> = {
  red: "bg-red-500",
  amber: "bg-amber-400",
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  gray: "bg-ink/30",
};

export function NeedsAttentionCard({ ops }: { ops: Ops }) {
  return (
    <Card title="Needs Attention" icon={AlertTriangle}>
      {ops.alerts.length === 0 ? (
        <p className="flex min-h-24 items-center justify-center gap-2 rounded-xl bg-green-50 text-sm text-green-700">
          <CircleCheck className="h-4 w-4" /> All clear — nothing needs action right now
        </p>
      ) : (
        <ul className="divide-y divide-ink/5">
          {ops.alerts.map((a) => {
            const [count, ...rest] = a.text.split(" ");
            return (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-blush/40">
                  <Dot className={TONE[a.tone]} />
                  <span className="w-6 shrink-0 font-bold text-ink">{count}</span>
                  <span className="flex-1 text-ink/70">{rest.join(" ")}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink/30" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
