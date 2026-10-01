// Report Generator (Admin → Reports): shared types. Raw rows come from the
// database (see queries/reportData.ts); builders turn them into a Report
// that the preview and every export format render the same way.

export type ReportType =
  | "sales"
  | "appointments"
  | "staff"
  | "client_spending"
  | "client_activity"
  | "services"
  | "branches"
  | "reviews"
  | "payments"
  | "cancellations"
  | "walkins";

export type ReportFilters = {
  from: string; // YYYY-MM-DD (Manila)
  to: string;
  branchId: string | null;
  staffId: string | null;
  service: string | null; // service name (names are shared across branches)
  status: string | null; // appointment status / payment status, depending on the report
  rating: number | null; // review report only
};

export type RawAppointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  sessionStatus: string | null;
  visitType: "appointment" | "walk_in";
  clientId: string | null;
  clientName: string;
  walkinPhone: string | null;
  branchId: string;
  branchName: string;
  staffId: string | null;
  staffName: string;
  services: string[];
  durationMinutes: number;
  price: number | null;
  arrivalTime: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  rescheduleCount: number;
};

export type RawPayment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  paymentType: string | null;
  createdAt: string;
  date: string; // Manila date of created_at
  verifiedAt: string | null;
  referenceNo: string | null;
  appointmentId: string;
  clientId: string | null;
  clientName: string;
  branchId: string;
  branchName: string;
  staffId: string | null;
  staffName: string;
  services: string[];
  visitType: "appointment" | "walk_in";
};

export type RawReview = {
  id: string;
  type: "service" | "staff" | "branch";
  rating: number;
  text: string | null;
  status: string;
  date: string;
  target: string;
  clientName: string;
  staffId: string | null;
  branchId: string | null;
  serviceName: string | null;
  photos: number;
};

export type ReportData = {
  appointments: RawAppointment[];
  payments: RawPayment[];
  reviews: RawReview[];
  /** Clients (by account id) with a visit before the report period. */
  returningClientIds: Set<string>;
  staff: { id: string; name: string; department: string | null; branchId: string | null }[];
  branches: { id: string; name: string }[];
};

export type Cell = string | number;
export type Column = { key: string; label: string; kind?: "text" | "number" | "money" | "percent" | "rating" };
export type ReportSection = { title: string; note?: string; columns: Column[]; rows: Record<string, Cell>[]; chart?: { labelKey: string; valueKey: string } };
export type SummaryItem = { label: string; value: string };

export type Report = {
  type: ReportType | "custom";
  title: string;
  period: { from: string; to: string };
  filtersUsed: [string, string][];
  summary: SummaryItem[];
  sections: ReportSection[];
  findings: string[];
  generatedAt: string;
};

export const REPORT_CATALOG: { type: ReportType; title: string; blurb: string; featured?: boolean; filters: ("branch" | "staff" | "service" | "status" | "rating")[] }[] = [
  { type: "sales", title: "Sales & Financial", blurb: "Revenue, payment methods, and sales by day, branch, service and staff.", featured: true, filters: ["branch", "staff", "service"] },
  { type: "staff", title: "Staff Performance", blurb: "Appointments, completed services, sales and ratings per staff member.", featured: true, filters: ["branch", "staff"] },
  { type: "client_spending", title: "Client Spending", blurb: "Top clients by actual paid transactions.", featured: true, filters: ["branch", "service"] },
  { type: "reviews", title: "Review Report", blurb: "Ratings, star breakdown, and reviews by staff, service and branch.", featured: true, filters: ["branch", "staff", "service", "rating"] },
  { type: "branches", title: "Branch Performance", blurb: "Compare branches: bookings, walk-ins, revenue, ratings and rates.", featured: true, filters: [] },
  { type: "appointments", title: "Appointments", blurb: "Completed, upcoming, cancelled and no-shows, with peak days and times.", filters: ["branch", "staff", "service", "status"] },
  { type: "client_activity", title: "Client Activity", blurb: "New vs returning clients, visits, and most active clients.", filters: ["branch"] },
  { type: "services", title: "Service Performance", blurb: "Bookings, completions, revenue and ratings per service.", filters: ["branch", "staff"] },
  { type: "payments", title: "Payments", blurb: "Every payment: paid, pending, verified, cash and GCash.", filters: ["branch", "status"] },
  { type: "cancellations", title: "Cancellations & No-Shows", blurb: "Lost bookings by service, staff and branch, and repeat no-shows.", filters: ["branch", "staff", "service"] },
  { type: "walkins", title: "Walk-Ins", blurb: "Walk-in volume, service times, and walk-ins by service, branch and staff.", filters: ["branch", "staff", "service"] },
];
