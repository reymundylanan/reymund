export const adminStats = [
  { label: "Total Bookings", value: "1,284", trend: "+12.5%", trendUp: true, note: "vs last month" },
  { label: "Monthly Revenue", value: "₱1.42M", trend: "+8.2%", trendUp: true, note: "vs last month" },
  { label: "Pending Payments", value: "24", trend: "-5.4%", trendUp: false, note: "vs last month" },
  { label: "Active Promotions", value: "8", trend: "+2", trendUp: true, note: "vs last month" },
];

export const bookingTrends = [
  { day: "Sun 19", value: 38 },
  { day: "Mon 20", value: 52 },
  { day: "Tue 21", value: 47 },
  { day: "Wed 22", value: 61 },
  { day: "Thu 23", value: 58 },
  { day: "Fri 24", value: 70 },
  { day: "Sat 25", value: 64 },
];

export const criticalAlerts = [
  { id: "a1", text: "Pasig: 2 Specialists missing for 4PM slot", tag: "Staffing Shortage" },
  { id: "a2", text: "Rose Quartz Face Oil — 0 units left", tag: "Restock" },
  { id: "a3", text: "Gold Infused Hydrator — 3 units left", tag: "Restock" },
];

export const revenueByBranch = [
  { branch: "One Cecilia Center", value: 95 },
  { branch: "Robinsons Pagadian", value: 80 },
];

export const recentActivity = [
  { id: "r1", actor: "Maria Santos", action: "Confirmed booking for Full Body Glow Spa", time: "2 mins ago" },
  { id: "r2", actor: "John Doe", action: "Processed GCash refund for TXN-90210", time: "15 mins ago" },
  { id: "r3", actor: "Liza Soberano", action: "Updated staff schedule for Makati Branch", time: "45 mins ago" },
  { id: "r4", actor: "Admin System", action: "Exported Revenue Report on Financials", time: "1 hour ago" },
  { id: "r5", actor: "Admin System", action: "Triggered low inventory alert Glow Serum v2", time: "3 hours ago" },
];


export const adminBookings = [
  {
    id: "GS-BK-9821",
    customer: "Jameson Miller",
    date: "Oct 24, 2023, 10:45 AM",
    method: "GCash",
    amount: "₱2,250.00",
    status: "Settled",
  },
  {
    id: "GS-BK-9822",
    customer: "Jameson Miller",
    date: "Oct 24, 2023, 11:30 AM",
    method: "Credit Card",
    amount: "₱4,500.00",
    status: "Settled",
  },
  {
    id: "GS-BK-9823",
    customer: "Aria Santos",
    date: "Oct 24, 2023, 01:15 PM",
    method: "GCash",
    amount: "₱1,200.00",
    status: "Pending",
  },
  {
    id: "GS-BK-9824",
    customer: "Aria Santos",
    date: "Oct 24, 2023, 02:40 PM",
    method: "Cash",
    amount: "₱850.00",
    status: "Settled",
  },
  {
    id: "GS-BK-9825",
    customer: "Marco Rivera",
    date: "Oct 24, 2023, 04:00 PM",
    method: "GCash",
    amount: "₱3,100.00",
    status: "Refunded",
  },
];

export const bookingStats = [
  { label: "Confirmed", value: 24, color: "text-green-600" },
  { label: "Pending", value: 8, color: "text-amber-600" },
  { label: "Conflicts", value: 2, color: "text-red-600" },
];

export const weekDays = ["Sun 19", "Mon 20", "Tue 21", "Wed 22", "Thu 23", "Fri 24", "Sat 25"];

export type Appointment = {
  id: string;
  customer: string;
  service: string;
  specialist: string;
  day: number; // 0 = Sun ... 6 = Sat
  startHour: number; // 8 = 8AM, 13.5 = 1:30PM
  duration: number; // hours
  status: "confirmed" | "pending" | "conflict";
  memberSince: string;
  bookingId: string;
};

export const appointments: Appointment[] = [
  {
    id: "ap1",
    customer: "Sophia Rodriguez",
    service: "Deep Tissue Massage",
    specialist: "Elena Rodriguez",
    day: 1,
    startHour: 9,
    duration: 1,
    status: "confirmed",
    memberSince: "Jan 2023",
    bookingId: "BK-001",
  },
  {
    id: "ap2",
    customer: "Aria Montgomery",
    service: "Gel Manicure + Spa Pedicure",
    specialist: "Sophia Rodriguez",
    day: 2,
    startHour: 9.5,
    duration: 1.5,
    status: "confirmed",
    memberSince: "Jun 2022",
    bookingId: "BK-002",
  },
  {
    id: "ap3",
    customer: "James Wilson",
    service: "Signature Facial",
    specialist: "Marcus Tan",
    day: 3,
    startHour: 10,
    duration: 1,
    status: "pending",
    memberSince: "Mar 2024",
    bookingId: "BK-003",
  },
  {
    id: "ap4",
    customer: "Liza Soberano",
    service: "Basic Glow Facial",
    specialist: "Marcus Tan",
    day: 4,
    startHour: 11,
    duration: 1,
    status: "conflict",
    memberSince: "Nov 2023",
    bookingId: "BK-004",
  },
  {
    id: "ap5",
    customer: "David Lim",
    service: "Hot Stone Massage",
    specialist: "Elena Rodriguez",
    day: 5,
    startHour: 13,
    duration: 1,
    status: "confirmed",
    memberSince: "Aug 2023",
    bookingId: "BK-005",
  },
];

export const paymentStats = [
  { label: "Total Revenue (Oct)", value: "₱428,290.00" },
  { label: "Pending Settlements", value: "₱18,450.00" },
  { label: "Refund Volume", value: "₱12,100.00" },
];

export const regionFilters = [
  { label: "All Regions", count: 2 },
  { label: "Zamboanga del Sur", count: 2 },
];

export const reportTemplates = [
  {
    id: "booking-management",
    label: "Booking Management",
    description: "Analyze booking volume, cancellations, and peak hours.",
  },
  {
    id: "promo-performance",
    label: "Promo Performance",
    description: "ROI tracking for active marketing campaigns and discounts.",
  },
  {
    id: "specialist-utilization",
    label: "Specialist Utilization",
    description: "Staff hours, commission tracking, and performance metrics.",
  },
];

export const notificationTemplates = [
  { id: "n1", name: "Booking Confirmation SMS" },
  { id: "n2", name: "Specialist Assigned Email" },
];

export const auditLogs = [
  { id: "l1", text: "Failed Login Attempt on Auth / 192.168.1.1", time: "2 mins ago", severity: "high" },
  { id: "l2", text: "Admin User updated Marcus Tan — Role changed from Staff to Specialist", time: "15 mins ago", severity: "normal" },
  { id: "l3", text: "Elena Rodriguez updated David Lim — Status changed to Suspended", time: "1 hour ago", severity: "normal" },
  { id: "l4", text: "Admin System triggered low inventory alert on Glow Serum v2", time: "3 hours ago", severity: "normal" },
  { id: "l5", text: "Maria Santos updated Sarah Jenkins — Reactivated account access", time: "2 days ago", severity: "normal" },
];

export const adminBranches = [
  {
    id: "one-cecilia-center",
    name: "One Cecilia Center",
    address: "3rd Floor, One Cecilia Center, corner Alano Street, R. Magsaysay St, Pagadian City, Zamboanga del Sur",
    region: "Zamboanga del Sur",
    manager: "",
    hours: "10:00 AM - 4:00 PM",
    status: "Active",
    image: "/images/branches/branches1.jpg",
  },
  {
    id: "robinson-mall",
    name: "Robinsons Pagadian",
    address: "F.S. Pajares Ave cor P.L. Urro St, cor Vicencio Sagun St, San Francisco District, Pagadian City, Zamboanga del Sur",
    region: "Zamboanga del Sur",
    manager: "",
    hours: "10:00 AM - 4:00 PM",
    status: "Active",
    image: "/images/services/spaservice.jpg",
  },
];
