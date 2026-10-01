"use client";

import { CalendarClock, LayoutDashboard, UserCog, UserPlus2, Users2, Wallet2 } from "lucide-react";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import PortalSidebar from "@/components/portal/PortalSidebar";

const navItems = [
  { href: "/frontdesk", label: "Dashboard", icon: LayoutDashboard },
  { href: "/frontdesk/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/frontdesk/payments", label: "Payments", icon: Wallet2 },
  { href: "/frontdesk/walk-ins", label: "Walk-Ins", icon: UserPlus2 },
  { href: "/frontdesk/clients", label: "Clients", icon: Users2 },
  { href: "/frontdesk/staff", label: "Staff Schedule", icon: UserCog, staffSchedule: true },
];

export default function FrontDeskSidebar() {
  const { profile } = useStaffProfile();
  // Staff Schedule is for Front Desk and Admin (055).
  const items = navItems.filter((item) => !item.staffSchedule || profile?.role === "front_desk" || profile?.role === "admin");
  return <PortalSidebar items={items} rootHref="/frontdesk" portalLabel="Front Desk" />;
}
