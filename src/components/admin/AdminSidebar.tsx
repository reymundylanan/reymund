"use client";

import { Bell, Building2, CalendarCheck, LayoutDashboard, Settings, Star, Users, Wallet } from "lucide-react";
import PortalSidebar from "@/components/portal/PortalSidebar";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users & Roles", icon: Users },
  { href: "/admin/bookings", label: "Bookings Management", icon: CalendarCheck },
  { href: "/admin/payments", label: "Payments & Financials", icon: Wallet },
  { href: "/admin/branches", label: "Branches & Services", icon: Building2 },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/reports", label: "Reports", icon: Settings },
];

export default function AdminSidebar() {
  return <PortalSidebar items={navItems} rootHref="/admin" portalLabel="Admin" />;
}
