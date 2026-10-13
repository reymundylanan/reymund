import { CalendarRange, MessageSquareHeart, Wallet } from "lucide-react";
import DateTimeChips from "@/components/admin/dashboard/DateTimeChips";
import SpaBanner, { spaGreeting } from "@/components/SpaBanner";
import { pesoShort } from "@/lib/adminOverview";
import type { AdminOverview as Data } from "@/lib/supabase/queries/adminOverview";

/** Admin Dashboard header: a spa photo with today's essentials and shortcuts. */
export default function WelcomeBanner({ firstName, data }: { firstName: string | null; data: Data }) {
  const k = data.kpis;
  const waiting = data.notifications.pendingBookings;
  return (
    <SpaBanner
      eyebrow="Blush Spa & Aesthetics · Admin"
      title={
        <>
          {spaGreeting()}
          {firstName ? `, ${firstName}` : ""} <span className="text-champagne">✨</span>
        </>
      }
      subtitle="Here's what's happening across your branches today."
      facts={[
        `${k.appointments.total} appointment${k.appointments.total === 1 ? "" : "s"} today`,
        `${pesoShort(k.revenue.today)} earned today`,
        waiting ? `${waiting} waiting for confirmation` : "Nothing waiting for confirmation",
      ]}
      aside={<DateTimeChips variant="glass" />}
      links={[
        { href: "/admin/multi-branch", label: "Day timeline", icon: CalendarRange },
        { href: "/admin/payments", label: "Payments", icon: Wallet },
        { href: "/admin/reviews", label: "Reviews", icon: MessageSquareHeart },
      ]}
    />
  );
}
