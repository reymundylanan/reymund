"use client";

import { useState } from "react";
import StaffScheduleHeader from "./StaffScheduleHeader";
import StaffShiftGrid from "./StaffShiftGrid";
import AddStaffBlockModal from "./AddStaffBlockModal";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function StaffScheduleClient() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function shiftDay(delta: number) {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }

  return (
    <>
      <StaffScheduleHeader
        date={selectedDate}
        onPrevDay={() => shiftDay(-1)}
        onNextDay={() => shiftDay(1)}
        onToday={() => setSelectedDate(startOfDay(new Date()))}
        onAddBlock={() => setShowAddBlock(true)}
      />
      <StaffShiftGrid
        selectedDate={selectedDate}
        refreshKey={refreshKey}
        onChanged={() => setRefreshKey((k) => k + 1)}
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
    </>
  );
}
