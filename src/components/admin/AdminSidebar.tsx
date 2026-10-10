"use client";

import { BarChart3, Bell, Building2, CalendarCheck, LayoutDashboard, SquareKanban, Star, Users, Wallet } from "lucide-react";
import PortalSidebar from "@/components/portal/PortalSidebar";
import { usePortalBadges } from "@/lib/hooks/usePortalBadges";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users & Roles", icon: Users },
  { href: "/admin/bookings", label: "Bookings Management", icon: CalendarCheck },
  { href: "/admin/payments", label: "Payments & Financials", icon: Wallet },
  { href: "/admin/branches", label: "Branches & Services", icon: Building2 },
  { href: "/admin/multi-branch", label: "Multi-Branch Management", icon: SquareKanban },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export default function AdminSidebar() {
  const badges = usePortalBadges("admin");
  return <PortalSidebar items={navItems} rootHref="/admin" portalLabel="Admin" badges={badges} />;
}
