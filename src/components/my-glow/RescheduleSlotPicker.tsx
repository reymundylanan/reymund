"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { getBookingWindow } from "@/lib/supabase/queries/spaSettings";
import { getProfessionalAppointmentsForRange, isSlotFree, type BookedSlot } from "@/lib/supabase/queries/availability";
import { rescheduleMyBookingAction } from "@/app/my-glow/actions";

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatSlotLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export default function RescheduleSlotPicker({
  appointmentId,
  professionalId,
  durationMinutes,
  initialDate,
  initialTime,
  onSaved,
  onCancel,
}: {
  appointmentId: string;
  professionalId: string | null;
  durationMinutes: number;
  initialDate: string;
  initialTime: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const today = toDateKey(new Date());
  const [date, setDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState<string | null>(initialTime);
  const [bookingWindow, setBookingWindow] = useState<{ start: string; end: string } | null>(null);
  const [bookedOnDate, setBookedOnDate] = useState<BookedSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBookingWindow(createClient()).then((w) => {
      if (!cancelled) setBookingWindow(w);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!professionalId || !date) {
      setBookedOnDate([]);
      setSlotsLoading(false);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    getProfessionalAppointmentsForRange(createClient(), professionalId, date, date).then((byDate) => {
      if (!cancelled) {
        setBookedOnDate(byDate[date] ?? []);
        setSlotsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [professionalId, date]);

  const slots = useMemo(() => {
    if (!bookingWindow) return [];
    const startMin = toMinutes(bookingWindow.start);
    const endMin = toMinutes(bookingWindow.end);
    const now = new Date();
    const nowMin = date === today ? now.getHours() * 60 + now.getMinutes() : -1;
    const list: { time: string; available: boolean }[] = [];
    for (let t = startMin; t + durationMinutes <= endMin; t += 30) {
      if (t <= nowMin) continue;
      const time = fromMinutes(t);
      const available = !professionalId || isSlotFree(bookedOnDate, time, durationMinutes, appointmentId);
      list.push({ time, available });
    }
    return list;
  }, [bookingWindow, bookedOnDate, durationMinutes, professionalId, date, today, appointmentId]);

  useEffect(() => {
    if (selectedTime && !slots.some((s) => s.time === selectedTime && s.available)) {
      setSelectedTime(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  async function save() {
    if (!selectedTime) {
      setError("Pick an available time slot.");
      return;
    }
    setSaving(true);
    setError(null);
    let result: { error: string | null };
    try {
      result = await rescheduleMyBookingAction({
        appointmentId,
        scheduledDate: date,
        startTime: `${selectedTime}:00`,
      });
    } catch (err) {
      console.error("rescheduleMyBookingAction threw:", err);
      setSaving(false);
      setError("Something went wrong saving the new time. Please try again.");
      return;
    }
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-ink/50">New Date</label>
        <input
          type="date"
          min={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setSelectedTime(null);
          }}
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-ink/50">
          Available Times{bookingWindow ? ` (${formatSlotLabel(bookingWindow.start)} – ${formatSlotLabel(bookingWindow.end)})` : ""}
        </label>
        {slotsLoading || !bookingWindow ? (
          <p className="mt-2 text-xs text-ink/40">Checking availability...</p>
        ) : slots.length === 0 ? (
          <p className="mt-2 text-xs text-ink/40">No time slots left for this date — try another day.</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s.time}
                onClick={() => s.available && setSelectedTime(s.time)}
                disabled={!s.available}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                  selectedTime === s.time
                    ? "border-coral bg-coral text-white"
                    : s.available
                    ? "border-ink/15 text-ink/70 hover:border-coral"
                    : "cursor-not-allowed border-ink/5 text-ink/25 line-through"
                }`}
              >
                {formatSlotLabel(s.time)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30">
          Go Back
        </button>
        <button
          onClick={save}
          disabled={saving || !selectedTime}
          className="flex-1 rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save New Time"}
        </button>
      </div>
    </div>
  );
}
