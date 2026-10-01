"use client";

import { useCallback, useState } from "react";
import { Coffee, UserX, Users } from "lucide-react";
import StaffScheduleHeader from "./StaffScheduleHeader";
import StaffScheduleTimeline, { type StaffStatusSummary } from "./StaffScheduleTimeline";
import AddStaffBlockModal from "./AddStaffBlockModal";
import StatDetailModal, { type StatDetailItem } from "@/components/frontdesk/StatDetailModal";
import { STATUS_LABEL, STATUS_STYLE } from "./StaffStatusControls";

type ScheduleStats = {
  capacityPercent: number | null;
  departments: string[];
  onDuty: StaffStatusSummary[];
  onBreak: StaffStatusSummary[];
  absent: StaffStatusSummary[];
};

type CardKey = "onDuty" | "onBreak" | "absent";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toItems(list: StaffStatusSummary[]): StatDetailItem[] {
  return list.map((s) => ({
    id: s.id,
    title: s.full_name,
    subtitle: s.department ?? undefined,
    badge: STATUS_LABEL[s.status],
    badgeStyle: STATUS_STYLE[s.status],
  }));
}

export default function StaffSchedulePageClient() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const [stats, setStats] = useState<ScheduleStats>({
    capacityPercent: null,
    departments: [],
    onDuty: [],
    onBreak: [],
    absent: [],
  });

  function shiftDay(delta: number) {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }

  const idsKey = (list: StaffStatusSummary[]) => list.map((s) => `${s.id}:${s.status}`).join(",");

  const handleStats = useCallback((next: ScheduleStats) => {
    setStats((prev) =>
      prev.capacityPercent === next.capacityPercent &&
      prev.departments.join(",") === next.departments.join(",") &&
      idsKey(prev.onDuty) === idsKey(next.onDuty) &&
      idsKey(prev.onBreak) === idsKey(next.onBreak) &&
      idsKey(prev.absent) === idsKey(next.absent)
        ? prev
        : next
    );
  }, []);

  const handleChanged = useCallback(() => setRefreshKey((k) => k + 1), []);

  const cards: { key: CardKey; label: string; icon: typeof Users; iconBg: string; iconColor: string; list: StaffStatusSummary[] }[] = [
    { key: "onDuty", label: "On Duty", icon: Users, iconBg: "bg-green-50", iconColor: "text-green-600", list: stats.onDuty },
    { key: "onBreak", label: "On Break", icon: Coffee, iconBg: "bg-purple-50", iconColor: "text-purple-600", list: stats.onBreak },
    { key: "absent", label: "Absent / Out", icon: UserX, iconBg: "bg-red-50", iconColor: "text-red-600", list: stats.absent },
  ];
  const openCardMeta = cards.find((c) => c.key === openCard);

  return (
    // status-colors: real (lighter) status hues here, not the warm remap.
    <div className="status-colors space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              onClick={() => setOpenCard(card.key)}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm transition hover:bg-blush/30"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${card.iconBg} ${card.iconColor}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-ink/50">{card.label}</p>
                <p className="text-xl font-semibold text-ink">{card.list.length}</p>
              </div>
            </button>
          );
        })}
      </div>

      <StaffScheduleHeader
        date={selectedDate}
        onPrevDay={() => shiftDay(-1)}
        onNextDay={() => shiftDay(1)}
        onToday={() => setSelectedDate(startOfDay(new Date()))}
        onAddBlock={() => setShowAddBlock(true)}
        search={search}
        onSearchChange={setSearch}
        capacityPercent={stats.capacityPercent}
        departments={stats.departments}
        departmentFilter={departmentFilter}
        onDepartmentFilterChange={setDepartmentFilter}
      />
      <StaffScheduleTimeline
        selectedDate={selectedDate}
        search={search}
        departmentFilter={departmentFilter}
        refreshKey={refreshKey}
        onChanged={handleChanged}
        onStats={handleStats}
      />
      {showAddBlock && (
        <AddStaffBlockModal
          defaultDate={selectedDate}
          onClose={() => setShowAddBlock(false)}
          onSaved={() => {
            setShowAddBlock(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {openCardMeta && (
        <StatDetailModal
          title={openCardMeta.label}
          items={toItems(openCardMeta.list)}
          emptyLabel={`No staff currently ${openCardMeta.label.toLowerCase()}.`}
          onClose={() => setOpenCard(null)}
        />
      )}
    </div>
  );
}
