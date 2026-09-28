"use client";

import { BarChart3, Download, Printer, Search } from "lucide-react";

type Option = { id: string; name: string };

export default function ReportsHeader({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  branches,
  branchId,
  onBranchChange,
  staff,
  staffId,
  onStaffChange,
  services,
  serviceId,
  onServiceChange,
  statusFilter,
  onStatusFilterChange,
  query,
  onQueryChange,
  onExport,
  onPrint,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  branches: Option[];
  branchId: string;
  onBranchChange: (v: string) => void;
  staff: Option[];
  staffId: string;
  onStaffChange: (v: string) => void;
  services: Option[];
  serviceId: string;
  onServiceChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  query: string;
  onQueryChange: (v: string) => void;
  onExport: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blush text-coral-dark">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Reports</h1>
            <p className="text-sm text-ink/50">
              Get insights on your business performance, clients, and operations.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onExport}
            className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          <button
            onClick={onPrint}
            className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="rounded-full border border-ink/15 px-3 py-2 text-sm text-ink/70 outline-none focus:border-coral"
        />
        <span className="text-sm text-ink/40">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="rounded-full border border-ink/15 px-3 py-2 text-sm text-ink/70 outline-none focus:border-coral"
        />

        <select
          value={branchId}
          onChange={(e) => onBranchChange(e.target.value)}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 outline-none focus:border-coral"
        >
          <option value="all">All Branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <select
          value={staffId}
          onChange={(e) => onStaffChange(e.target.value)}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 outline-none focus:border-coral"
        >
          <option value="all">All Staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={serviceId}
          onChange={(e) => onServiceChange(e.target.value)}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 outline-none focus:border-coral"
        >
          <option value="all">All Services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 outline-none focus:border-coral"
        >
          <option value="all">All Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search reports (staff, service, client)..."
            className="w-full text-sm outline-none placeholder:text-ink/40"
          />
        </div>
      </div>
    </div>
  );
}
