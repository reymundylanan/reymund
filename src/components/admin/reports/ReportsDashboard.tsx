"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getReportsSummary,
  getRevenueOverview,
  getBookingTrends,
  getBranchPerformance,
  getSalesPayments,
  getTopServices,
  getTopStaff,
  getClientAnalytics,
  getReviewsSummary,
  getAttendanceToday,
  type ReportFilters,
  type ReportsSummary,
  type SeriesPoint,
  type BookingTrendPoint,
  type BranchPerformance,
  type SalesPayments,
  type TopService,
  type TopStaffRow,
  type ClientAnalytics,
  type ReviewsSummary,
  type AttendanceSummary,
} from "@/lib/supabase/queries/reports";
import ReportsHeader from "@/components/admin/reports/ReportsHeader";
import ReportsKpiCards from "@/components/admin/reports/ReportsKpiCards";
import RevenueOverviewChart from "@/components/admin/reports/RevenueOverviewChart";
import BookingTrendsChart from "@/components/admin/reports/BookingTrendsChart";
import BranchPerformanceCard from "@/components/admin/reports/BranchPerformanceCard";
import SalesPaymentsCard from "@/components/admin/reports/SalesPaymentsCard";
import TopServicesCard from "@/components/admin/reports/TopServicesCard";
import TopStaffCard from "@/components/admin/reports/TopStaffCard";
import ClientAnalyticsCard from "@/components/admin/reports/ClientAnalyticsCard";
import ClientReviewsCard from "@/components/admin/reports/ClientReviewsCard";
import AttendanceScheduleCard from "@/components/admin/reports/AttendanceScheduleCard";

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

const emptySummary: ReportsSummary = {
  totalRevenue: 0,
  revenueTrendPct: 0,
  totalAppointments: 0,
  appointmentsTrendPct: 0,
  walkIns: 0,
  walkInsTrendPct: 0,
  totalClients: 0,
  clientsTrendPct: 0,
};

export default function ReportsDashboard() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState(toDateKey(weekAgo));
  const [endDate, setEndDate] = useState(toDateKey(today));
  const [branchId, setBranchId] = useState("all");
  const [staffId, setStaffId] = useState("all");
  const [serviceId, setServiceId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [serviceOptions, setServiceOptions] = useState<{ id: string; name: string }[]>([]);

  const [summary, setSummary] = useState<ReportsSummary>(emptySummary);
  const [revenue, setRevenue] = useState<SeriesPoint[]>([]);
  const [bookingTrends, setBookingTrends] = useState<BookingTrendPoint[]>([]);
  const [branchPerf, setBranchPerf] = useState<BranchPerformance[]>([]);
  const [sales, setSales] = useState<SalesPayments>({ totalSales: 0, byMethod: [], paid: 0, unpaidCount: 0, transactions: 0 });
  const [topServices, setTopServices] = useState<TopService[]>([]);
  const [topStaff, setTopStaff] = useState<TopStaffRow[]>([]);
  const [clientAnalytics, setClientAnalytics] = useState<ClientAnalytics>({ topSpenders: [], growth: [] });
  const [reviews, setReviews] = useState<ReviewsSummary>({ average: 0, count: 0, breakdown: [], recent: [] });
  const [attendance, setAttendance] = useState<AttendanceSummary>({ present: 0, onLeave: 0, dayOff: 0, schedule: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("staff_members").select("id, full_name").order("full_name"),
      supabase.from("branch_services").select("id, name").eq("status", "Active").order("name"),
    ]).then(([b, s, sv]) => {
      setBranches((b.data as { id: string; name: string }[]) ?? []);
      setStaffOptions(((s.data as { id: string; full_name: string }[]) ?? []).map((r) => ({ id: r.id, name: r.full_name })));
      const seen = new Set<string>();
      const services = ((sv.data as { id: string; name: string }[]) ?? []).filter((r) => {
        if (seen.has(r.name)) return false;
        seen.add(r.name);
        return true;
      });
      setServiceOptions(services);
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const supabase = createClient();
    const filters: ReportFilters = {
      branchId: branchId === "all" ? null : branchId,
      staffId: staffId === "all" ? null : staffId,
      serviceId: serviceId === "all" ? null : serviceId,
      status: statusFilter,
      startDate,
      endDate,
    };

    Promise.all([
      getReportsSummary(supabase, filters),
      getRevenueOverview(supabase, filters),
      getBookingTrends(supabase, filters),
      getBranchPerformance(supabase, filters),
      getSalesPayments(supabase, filters),
      getTopServices(supabase, filters),
      getTopStaff(supabase, filters),
      getClientAnalytics(supabase, filters),
      getReviewsSummary(supabase, filters.branchId),
      getAttendanceToday(supabase, filters.branchId),
    ]).then(([s, rev, bt, bp, sp, ts, tst, ca, rv, att]) => {
      setSummary(s);
      setRevenue(rev);
      setBookingTrends(bt);
      setBranchPerf(bp);
      setSales(sp);
      setTopServices(ts);
      setTopStaff(tst);
      setClientAnalytics(ca);
      setReviews(rv);
      setAttendance(att);
      setLoading(false);
    });
  }, [branchId, staffId, serviceId, statusFilter, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filteredServices = q ? topServices.filter((s) => s.name.toLowerCase().includes(q)) : topServices;
  const filteredStaff = q ? topStaff.filter((s) => s.name.toLowerCase().includes(q)) : topStaff;
  const filteredSpenders = q
    ? { ...clientAnalytics, topSpenders: clientAnalytics.topSpenders.filter((c) => c.name.toLowerCase().includes(q)) }
    : clientAnalytics;

  function handleExport() {
    const rows = [
      ["Metric", "Value"],
      ["Total Revenue", summary.totalRevenue],
      ["Total Appointments", summary.totalAppointments],
      ["Walk-Ins", summary.walkIns],
      ["Total Clients", summary.totalClients],
      [],
      ["Top Services", "Bookings", "Revenue"],
      ...topServices.map((s) => [s.name, s.bookings, s.revenue]),
      [],
      ["Top Staff", "Completed"],
      ...topStaff.map((s) => [s.name, s.completed]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glowsync-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <ReportsHeader
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        branches={branches}
        branchId={branchId}
        onBranchChange={setBranchId}
        staff={staffOptions}
        staffId={staffId}
        onStaffChange={setStaffId}
        services={serviceOptions}
        serviceId={serviceId}
        onServiceChange={setServiceId}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        query={query}
        onQueryChange={setQuery}
        onExport={handleExport}
        onPrint={() => window.print()}
      />

      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-ink/40 shadow-sm">Loading report data…</div>
      ) : (
        <>
          <ReportsKpiCards summary={summary} />

          <div className="grid gap-6 lg:grid-cols-2">
            <RevenueOverviewChart data={revenue} />
            <BookingTrendsChart data={bookingTrends} />
          </div>

          <BranchPerformanceCard branches={branchPerf} />

          <div className="grid gap-6 lg:grid-cols-2">
            <SalesPaymentsCard sales={sales} />
            <TopServicesCard services={filteredServices} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopStaffCard staff={filteredStaff} />
            <ClientAnalyticsCard analytics={filteredSpenders} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ClientReviewsCard reviews={reviews} />
            <AttendanceScheduleCard attendance={attendance} />
          </div>
        </>
      )}
    </div>
  );
}
