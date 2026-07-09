"use client";

import { Calendar, CheckSquare, Clock, Megaphone, Star, Users } from "lucide-react";

const todayAppointments = [
  { id: "a1", time: "9:00 AM", client: "Ana Reyes", service: "Full Body Massage", duration: "60 mins", status: "Confirmed" },
  { id: "a2", time: "10:30 AM", client: "Liza Santos", service: "Facial Treatment", duration: "45 mins", status: "Confirmed" },
  { id: "a3", time: "1:00 PM", client: "Maria Cruz", service: "Gluta Drip", duration: "75 mins", status: "Pending" },
  { id: "a4", time: "3:00 PM", client: "Jenny Tan", service: "Foot Spa Package", duration: "60 mins", status: "Confirmed" },
];

const assignedClients = [
  { id: "c1", name: "Ana Reyes", visits: 8, lastVisit: "June 28, 2026", favorite: "Full Body Massage" },
  { id: "c2", name: "Liza Santos", visits: 5, lastVisit: "July 1, 2026", favorite: "Facial Treatment" },
  { id: "c3", name: "Maria Cruz", visits: 3, lastVisit: "June 15, 2026", favorite: "Gluta Drip" },
  { id: "c4", name: "Jenny Tan", visits: 12, lastVisit: "July 5, 2026", favorite: "Foot Spa Package" },
];

const pendingTasks = [
  { id: "t1", task: "Restock massage oils — Room 2", priority: "High" },
  { id: "t2", task: "Submit weekly service log", priority: "Medium" },
  { id: "t3", task: "Sanitize treatment beds after 3PM slot", priority: "High" },
  { id: "t4", task: "Update client preference notes for Ana Reyes", priority: "Low" },
];

const announcements = [
  { id: "n1", title: "New Service Added", body: "Cinderella Super Whitening Drip is now available. Training session on July 12.", date: "July 8, 2026" },
  { id: "n2", title: "Schedule Reminder", body: "Please submit your preferred off-days for August by July 15.", date: "July 7, 2026" },
  { id: "n3", title: "Product Restock", body: "Rose Quartz Face Oil has been restocked. Now available for use.", date: "July 6, 2026" },
];

const scheduleSlots = [
  { time: "9:00 AM", label: "Ana Reyes — Full Body Massage", color: "bg-coral/10 border-coral text-coral-dark" },
  { time: "10:30 AM", label: "Liza Santos — Facial Treatment", color: "bg-coral/10 border-coral text-coral-dark" },
  { time: "12:00 PM", label: "Lunch Break", color: "bg-ink/5 border-ink/10 text-ink/40" },
  { time: "1:00 PM", label: "Maria Cruz — Gluta Drip", color: "bg-amber-50 border-amber-200 text-amber-700" },
  { time: "2:30 PM", label: "Open Slot", color: "bg-green-50 border-green-200 text-green-700" },
  { time: "3:00 PM", label: "Jenny Tan — Foot Spa Package", color: "bg-coral/10 border-coral text-coral-dark" },
];

const statusStyles: Record<string, string> = {
  Confirmed: "bg-green-100 text-green-700",
  Pending: "bg-amber-100 text-amber-700",
  Completed: "bg-blush text-coral-dark",
};

const priorityStyles: Record<string, string> = {
  High: "bg-red-100 text-red-600",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-green-100 text-green-700",
};

export default function StaffDashboard() {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Today's Appointments", value: "4", icon: Calendar, color: "text-coral" },
          { label: "Completed Services", value: "128", icon: CheckSquare, color: "text-green-600" },
          { label: "Assigned Clients", value: "4", icon: Users, color: "text-blue-500" },
          { label: "Avg Rating", value: "4.9 ★", icon: Star, color: "text-amber-500" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink/50">{stat.label}</p>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-ink">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Appointments */}
        <div className="rounded-2xl bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-ink/10 px-6 py-4">
            <Calendar className="h-4 w-4 text-coral" />
            <h2 className="font-semibold text-ink">Today&apos;s Appointments</h2>
          </div>
          <div className="divide-y divide-ink/5">
            {todayAppointments.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="w-16 text-xs font-medium text-ink/50">{a.time}</span>
                  <div>
                    <p className="text-sm font-medium text-ink">{a.client}</p>
                    <p className="text-xs text-ink/50">{a.service} · {a.duration}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[a.status]}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Schedule */}
        <div className="rounded-2xl bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-ink/10 px-6 py-4">
            <Clock className="h-4 w-4 text-coral" />
            <h2 className="font-semibold text-ink">Daily Schedule</h2>
          </div>
          <div className="space-y-2 p-4">
            {scheduleSlots.map((slot) => (
              <div
                key={slot.time}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${slot.color}`}
              >
                <span className="w-16 text-xs font-semibold">{slot.time}</span>
                <span className="text-sm">{slot.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Assigned Clients */}
        <div className="rounded-2xl bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-ink/10 px-6 py-4">
            <Users className="h-4 w-4 text-coral" />
            <h2 className="font-semibold text-ink">Assigned Clients</h2>
          </div>
          <div className="divide-y divide-ink/5">
            {assignedClients.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-semibold text-coral-dark">
                    {c.name.charAt(0)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-ink/50">Fav: {c.favorite}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink">{c.visits} visits</p>
                  <p className="text-xs text-ink/40">Last: {c.lastVisit}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="rounded-2xl bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-ink/10 px-6 py-4">
            <CheckSquare className="h-4 w-4 text-coral" />
            <h2 className="font-semibold text-ink">Pending Tasks</h2>
          </div>
          <div className="divide-y divide-ink/5">
            {pendingTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-4">
                <p className="text-sm text-ink">{t.task}</p>
                <span className={`ml-4 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${priorityStyles[t.priority]}`}>
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Announcements */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-ink/10 px-6 py-4">
          <Megaphone className="h-4 w-4 text-coral" />
          <h2 className="font-semibold text-ink">Announcements from Admin</h2>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-3">
          {announcements.map((n) => (
            <div key={n.id} className="rounded-xl border border-ink/10 p-4">
              <p className="text-xs text-ink/40">{n.date}</p>
              <p className="mt-1 font-semibold text-ink">{n.title}</p>
              <p className="mt-1 text-sm text-ink/60">{n.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Summary */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-ink/10 px-6 py-4">
          <Star className="h-4 w-4 text-coral" />
          <h2 className="font-semibold text-ink">Performance Summary</h2>
          <span className="ml-auto text-xs text-ink/40">This Month</span>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-4">
          {[
            { label: "Services Completed", value: "48", sub: "+6 vs last month" },
            { label: "Client Rating", value: "4.9 / 5.0", sub: "Based on 32 reviews" },
            { label: "Repeat Clients", value: "78%", sub: "High retention" },
            { label: "On-time Rate", value: "96%", sub: "2 late starts" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-blush/50 p-4 text-center">
              <p className="text-2xl font-bold text-ink">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-ink/70">{stat.label}</p>
              <p className="mt-0.5 text-xs text-ink/40">{stat.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
