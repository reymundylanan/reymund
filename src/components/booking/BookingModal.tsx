"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, MapPin, Star, X } from "lucide-react";
import {
  branchContacts,
  branchServiceCategories,
  professionals,
  timeSlots,
  type BranchService,
} from "@/lib/data";
import type { BookableService } from "@/components/booking/BookingContext";
import { createClient } from "@/lib/supabase/client";

type Step =
  | "type"
  | "branch"
  | "services"
  | "professional"
  | "time"
  | "confirm"
  | "payment-choice"
  | "checkout"
  | "otp"
  | "success";

type AppointmentType = "solo" | "group";

const TABS: { id: Step; label: string }[] = [
  { id: "branch", label: "Branch" },
  { id: "services", label: "Services" },
  { id: "professional", label: "Professional" },
  { id: "time", label: "Time" },
  { id: "confirm", label: "Confirm" },
];

const PROMO_CODE = "000001";
const PROMO_DISCOUNT = 50;
const REFERENCE_CODE = "9bf8f1";
const OTP_SECONDS = 120;

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthGrid(monthDate: Date) {
  const first = startOfMonth(monthDate);
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0
  ).getDate();
  const leading = first.getDay();
  const cells: (number | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatPhoneInput(digits: string) {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ");
}

function isBeforeToday(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function parseDurationMinutes(durationLabel: string) {
  const minutesMatch = durationLabel.match(/(\d+)\s*mins?/);
  const hoursMatch = durationLabel.match(/(\d+)\s*hour/);
  return minutesMatch
    ? parseInt(minutesMatch[1], 10)
    : hoursMatch
      ? parseInt(hoursMatch[1], 10) * 60
      : 60;
}

function to24Hour(start: string) {
  const [time, meridiem] = start.split(" ");
  const [h, m] = time.split(":").map(Number);
  let hour24 = h % 12;
  if (meridiem === "PM") hour24 += 12;
  return `${hour24.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;
}

function endTime(start: string, durationLabel: string) {
  const minutes = parseDurationMinutes(durationLabel);

  const [time, meridiem] = start.split(" ");
  const [h, m] = time.split(":").map(Number);
  let hour24 = h % 12;
  if (meridiem === "PM") hour24 += 12;
  const totalStart = hour24 * 60 + m;
  const totalEnd = totalStart + minutes;
  const endHour24 = Math.floor(totalEnd / 60) % 24;
  const endMinute = totalEnd % 60;
  const endMeridiem = endHour24 >= 12 ? "PM" : "AM";
  const endHour12 = endHour24 % 12 === 0 ? 12 : endHour24 % 12;
  return `${endHour12}:${endMinute.toString().padStart(2, "0")} ${endMeridiem}`;
}

export default function BookingModal({
  service,
  onClose,
}: {
  service: BookableService;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("type");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("solo");
  const [payLater, setPayLater] = useState(false);
  const [categoryId, setCategoryId] = useState(branchServiceCategories[0].id);
  const [selectedService, setSelectedService] = useState<BranchService>(service);
  const [professionalId, setProfessionalId] = useState<string | "any" | null>(
    null
  );
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [mobileNumber, setMobileNumber] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [secondsLeft, setSecondsLeft] = useState(OTP_SECONDS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "otp") return;
    setSecondsLeft(OTP_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const selectedDate = useMemo(() => {
    if (!selectedDay) return null;
    return new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), selectedDay);
  }, [calendarMonth, selectedDay]);

  const branch = branchContacts.find((b) => b.id === branchId) ?? branchContacts[0];

  const professionalLabel =
    professionalId === "any" || !professionalId
      ? "any professional"
      : professionals.find((p) => p.id === professionalId)?.name ?? "any professional";

  const total = Math.max(
    selectedService.price - (promoApplied ? PROMO_DISCOUNT : 0),
    0
  );

  const activeCategory = branchServiceCategories.find((c) => c.id === categoryId)!;

  function close() {
    onClose();
  }

  async function saveBooking(opts: { paid: boolean }) {
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setSaveError("You must be logged in to book.");
        setSaving(false);
        return false;
      }

      const { data: branchRow } = await supabase
        .from("branches")
        .select("id")
        .eq("name", branch.name)
        .maybeSingle();

      if (!branchRow || !selectedDate || !selectedTime) {
        setSaveError("Missing branch, date, or time.");
        setSaving(false);
        return false;
      }

      const bookingCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      const scheduledDate = `${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${selectedDate.getDate().toString().padStart(2, "0")}`;

      const { data: appt, error } = await supabase
        .from("appointments")
        .insert({
          booking_code: bookingCode,
          branch_id: branchRow.id,
          client_id: authData.user.id,
          appointment_type: appointmentType,
          scheduled_date: scheduledDate,
          start_time: to24Hour(selectedTime),
          duration_minutes: parseDurationMinutes(selectedService.duration),
          status: opts.paid ? "confirmed" : "pending",
          notes: `${selectedService.name} (${selectedService.duration}) with ${professionalLabel} — ₱${total.toLocaleString()}.00`,
        })
        .select("id")
        .single();

      if (error || !appt) {
        setSaveError(error?.message ?? "Failed to save booking.");
        setSaving(false);
        return false;
      }

      if (contactPhone.trim()) {
        await supabase
          .from("profiles")
          .update({ phone: `+63 ${formatPhoneInput(contactPhone)}` })
          .eq("id", authData.user.id);
      }

      if (opts.paid) {
        await supabase.from("payments").insert({
          appointment_id: appt.id,
          reference_no: REFERENCE_CODE,
          sender_name: mobileNumber,
          amount: total,
          method: "gcash",
          status: "settled",
        });
      }

      setSaving(false);
      return true;
    } catch {
      setSaveError("Network error — could not save booking.");
      setSaving(false);
      return false;
    }
  }

  function goToTab(tab: Step) {
    const order: Step[] = ["branch", "services", "professional", "time", "confirm"];
    if (order.indexOf(tab) <= order.indexOf(step)) setStep(tab);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div>
            <p className="font-semibold text-ink">Blush Spa &amp; Aesthetics</p>
            <p className="flex items-center gap-2 text-xs text-ink/50">
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                <Star className="h-3 w-3 fill-gold text-gold" />
                {branch.rating} (3)
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {branch.address}
              </span>
            </p>
          </div>
          <button onClick={close} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        {step !== "type" &&
          step !== "payment-choice" &&
          step !== "checkout" &&
          step !== "otp" &&
          step !== "success" && (
          <div className="flex border-b border-ink/10 px-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => goToTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium ${
                  step === tab.id
                    ? "border-b-2 border-coral text-coral-dark"
                    : "text-ink/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === "type" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => {
                  setAppointmentType("solo");
                  setStep("branch");
                }}
                className="rounded-2xl border border-ink/10 p-6 text-left hover:border-coral"
              >
                <p className="font-semibold text-ink">Book an appointment</p>
                <p className="mt-1 text-sm text-ink/60">
                  Schedule services for yourself
                </p>
                <span className="mt-4 inline-block rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white">
                  Book Now
                </span>
              </button>
              <button
                onClick={() => {
                  setAppointmentType("group");
                  setStep("branch");
                }}
                className="rounded-2xl border border-ink/10 p-6 text-left hover:border-coral"
              >
                <p className="font-semibold text-ink">Group appointment</p>
                <p className="mt-1 text-sm text-ink/60">For yourself &amp; others</p>
                <span className="mt-4 inline-block rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white">
                  Book Now
                </span>
              </button>
            </div>
          )}

          {step === "branch" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink">
                Choose a branch
              </p>
              {branchContacts.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBranchId(b.id)}
                  className={`flex w-full items-start justify-between rounded-xl border p-4 text-left ${
                    branchId === b.id ? "border-coral bg-blush" : "border-ink/10"
                  }`}
                >
                  <div>
                    <p className="font-medium text-ink">{b.name}</p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-ink/60">
                      <MapPin className="h-3.5 w-3.5" /> {b.address}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
                    <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                    {b.rating}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === "services" && (
            <div>
              <div className="flex flex-wrap gap-2">
                {branchServiceCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                      categoryId === cat.id
                        ? "bg-coral text-white"
                        : "text-ink/50 hover:text-coral-dark"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                {activeCategory.services.map((svc, i) => {
                  const isSelected =
                    svc.name === selectedService.name &&
                    svc.duration === selectedService.duration;
                  return (
                    <div
                      key={`${svc.name}-${i}`}
                      className={`flex items-center justify-between rounded-xl border p-4 ${
                        isSelected ? "border-coral bg-blush" : "border-ink/10"
                      }`}
                    >
                      <div>
                        <p className="font-medium text-ink">{svc.name}</p>
                        <p className="text-xs text-ink/50">({svc.duration})</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gold">
                          ₱{svc.price.toLocaleString()}.00
                        </span>
                        <button
                          onClick={() => setSelectedService(svc)}
                          className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                            isSelected
                              ? "bg-coral text-white"
                              : "border border-ink/15 text-ink/70 hover:border-coral"
                          }`}
                        >
                          {isSelected ? <Check className="h-3.5 w-3.5" /> : "Select"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === "professional" && (
            <div className="space-y-3">
              <button
                onClick={() => setProfessionalId("any")}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${
                  professionalId === "any" ? "border-coral bg-blush" : "border-ink/10"
                }`}
              >
                <div>
                  <p className="font-medium text-ink">Any professional</p>
                  <p className="text-xs text-ink/50">for maximum availability</p>
                </div>
                <span
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                    professionalId === "any"
                      ? "bg-coral text-white"
                      : "border border-ink/15 text-ink/70"
                  }`}
                >
                  {professionalId === "any" ? <Check className="h-3.5 w-3.5" /> : "Select"}
                </span>
              </button>

              {professionals.map((pro) => (
                <div
                  key={pro.id}
                  className={`flex items-center justify-between rounded-xl border p-4 ${
                    professionalId === pro.id ? "border-coral bg-blush" : "border-ink/10"
                  }`}
                >
                  <div>
                    <p className="font-medium text-ink">{pro.name}</p>
                    <p className="text-xs text-ink/50">{pro.role}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="text-xs font-medium text-coral-dark">
                      View profile
                    </button>
                    <button
                      onClick={() => setProfessionalId(pro.id)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                        professionalId === pro.id
                          ? "bg-coral text-white"
                          : "border border-ink/15 text-ink/70 hover:border-coral"
                      }`}
                    >
                      {professionalId === pro.id ? <Check className="h-3.5 w-3.5" /> : "Select"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === "time" && (
            <div className="grid gap-6 sm:grid-cols-[1fr_180px]">
              <div>
                <div className="flex items-center justify-between">
                  <button
                    disabled={calendarMonth.getTime() <= startOfMonth(new Date()).getTime()}
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                      )
                    }
                    className="text-ink/40 hover:text-ink disabled:opacity-20 disabled:hover:text-ink/40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <p className="text-sm font-semibold text-ink">
                    {calendarMonth.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <button
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                      )
                    }
                    className="text-ink/40 hover:text-ink"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-ink/40">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
                  {buildMonthGrid(calendarMonth).map((day, i) => {
                    const cellDate = day
                      ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
                      : null;
                    const isPast = cellDate ? isBeforeToday(cellDate) : false;
                    return (
                      <button
                        key={i}
                        disabled={!day || isPast}
                        onClick={() => day && !isPast && setSelectedDay(day)}
                        className={`aspect-square rounded-full ${
                          !day
                            ? ""
                            : isPast
                              ? "text-ink/20 cursor-not-allowed"
                              : day === selectedDay
                                ? "bg-coral text-white"
                                : "hover:bg-blush"
                        }`}
                      >
                        {day ?? ""}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 overflow-y-auto">
                {timeSlots.map((time) => (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className={`block w-full rounded-lg border px-3 py-2 text-sm ${
                      selectedTime === time
                        ? "border-coral bg-blush text-coral-dark"
                        : "border-ink/10 text-ink/70 hover:border-coral"
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-ink/10 p-4">
                <p className="font-medium text-ink">
                  {selectedService.name} ({selectedService.duration}) with {professionalLabel}
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  {selectedDate ? formatDate(selectedDate) : "Select a date"} &bull;{" "}
                  {selectedTime
                    ? `${selectedTime} - ${endTime(selectedTime, selectedService.duration)}`
                    : "Select a time"}
                </p>
                <p className="mt-2 font-semibold text-gold">
                  ₱{selectedService.price.toLocaleString()}.00
                </p>
              </div>
              {appointmentType === "group" && (
                <p className="text-xs text-ink/50">
                  Group appointments require full payment to confirm the slot.
                </p>
              )}
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">
                  Contact Number
                </label>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/15 px-3 py-2 transition-colors focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/20">
                  <span className="text-sm text-ink/50">+63</span>
                  <input
                    value={formatPhoneInput(contactPhone)}
                    onChange={(e) =>
                      setContactPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder="9XX XXX XXXX"
                    className="w-full text-sm outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-ink/40">
                  So the branch can reach you about this appointment.
                </p>
              </div>
            </div>
          )}

          {step === "payment-choice" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => setStep("checkout")}
                className="rounded-2xl border border-ink/10 p-6 text-left hover:border-coral"
              >
                <p className="font-semibold text-ink">Pay Now</p>
                <p className="mt-1 text-sm text-ink/60">
                  Pay via GCash now to fully secure your slot.
                </p>
              </button>
              <button
                onClick={async () => {
                  const ok = await saveBooking({ paid: false });
                  if (ok) {
                    setPayLater(true);
                    setStep("success");
                  }
                }}
                disabled={saving}
                className="rounded-2xl border border-ink/10 p-6 text-left hover:border-coral disabled:opacity-50"
              >
                <p className="font-semibold text-ink">Pay Later</p>
                <p className="mt-1 text-sm text-ink/60">
                  Reserve now, settle payment at the branch on your appointment
                  date.
                </p>
              </button>
            </div>
          )}
          {step === "payment-choice" && saveError && (
            <p className="mt-3 text-sm text-red-600">{saveError}</p>
          )}

          {step === "checkout" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-ink">Checkout</h2>
                <p className="text-sm text-ink/60">
                  Please complete your payment to secure your appointment.
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-ink">
                  Choose Payment Method
                </p>
                <div className="rounded-xl border border-coral bg-blush p-4">
                  <p className="font-medium text-ink">
                    GCash Payment{" "}
                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      Secured
                    </span>
                  </p>
                  <p className="text-sm text-ink/60">
                    Pay instantly using your GCash wallet
                  </p>

                  <label className="mt-4 block text-xs font-medium text-ink/60">
                    GCash Registered Mobile Number
                  </label>
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 py-2">
                    <span className="text-sm text-ink/50">+63</span>
                    <input
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="9XX XXX XXXX"
                      className="w-full text-sm outline-none"
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink/40">
                    We will send a 6-digit authentication code to this number.
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Order Summary</p>
                <div className="rounded-xl border border-ink/10 p-4 text-sm">
                  <p className="font-medium text-ink">
                    {selectedService.name} ({selectedService.duration}) with{" "}
                    {professionalLabel}
                  </p>
                  <p className="mt-1 text-ink/60">
                    {selectedDate ? formatDate(selectedDate) : ""} &bull;{" "}
                    {selectedTime
                      ? `${selectedTime} - ${endTime(selectedTime, selectedService.duration)}`
                      : ""}
                  </p>
                  <p className="mt-2 font-semibold text-gold">
                    ₱{selectedService.price.toLocaleString()}.00
                  </p>

                  <div className="mt-4 flex items-center gap-2 border-t border-ink/10 pt-4">
                    <input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      placeholder="Promo Code"
                      className="flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none"
                    />
                    <button
                      onClick={() => setPromoApplied(promoInput.trim() === PROMO_CODE)}
                      className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold text-ink/70 hover:border-coral"
                    >
                      Apply
                    </button>
                  </div>
                  {promoApplied && (
                    <p className="mt-2 text-xs text-green-700">
                      Promo ({PROMO_CODE.slice(0, 3)}xxx) -₱{PROMO_DISCOUNT}.00
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-ink/10 pt-3 font-semibold text-ink">
                    <span>Total</span>
                    <span>₱{total.toLocaleString()}.00</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold text-ink">One-Time PIN</h2>
              <p className="text-sm text-ink/60">
                Your One-Time PIN (OTP) with reference code {REFERENCE_CODE} has been
                sent to your registered mobile number: +63 {mobileNumber || "9XX XXX XXXX"}
              </p>
              <p className="text-sm text-ink/60">
                Your OTP will expire in {Math.floor(secondsLeft / 60)}:
                {(secondsLeft % 60).toString().padStart(2, "0")} minutes.
              </p>

              <div className="flex justify-center gap-2">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    value={digit}
                    maxLength={1}
                    onChange={(e) => {
                      const next = [...otp];
                      next[i] = e.target.value.replace(/\D/g, "");
                      setOtp(next);
                    }}
                    className="h-12 w-10 rounded-lg border border-ink/15 text-center text-lg outline-none focus:border-coral"
                  />
                ))}
              </div>

              <button
                disabled={secondsLeft === 0}
                onClick={() => setSecondsLeft(OTP_SECONDS)}
                className="text-sm font-medium text-coral-dark disabled:opacity-40"
              >
                Resend OTP
              </button>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            </div>
          )}

          {step === "success" && (
            <div className="space-y-3 py-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
                <Check className="h-7 w-7" />
              </span>
              <h2 className="text-lg font-semibold text-ink">Booking confirmed!</h2>
              <p className="text-sm text-ink/60">
                {selectedService.name} on{" "}
                {selectedDate ? formatDate(selectedDate) : ""} at {selectedTime}.
              </p>
              {payLater && (
                <p className="text-sm text-ink/60">
                  Please settle payment of ₱{total.toLocaleString()}.00 at the
                  branch on your appointment date.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-ink/10 px-6 py-4">
          <div className="text-sm text-ink/60">
            {step === "services" || step === "professional" || step === "time" ? (
              <>
                <span className="font-medium text-ink">{selectedService.name}</span>{" "}
                &bull; Total{" "}
                <span className="font-semibold text-gold">
                  ₱{selectedService.price.toLocaleString()}.00
                </span>
              </>
            ) : null}
          </div>

          {step === "type" && null}

          {step === "branch" && (
            <button
              disabled={!branchId}
              onClick={() => setStep("services")}
              className="ml-auto rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continue
            </button>
          )}

          {step === "services" && (
            <button
              onClick={() => setStep("professional")}
              className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              Continue
            </button>
          )}

          {step === "professional" && (
            <button
              disabled={!professionalId}
              onClick={() => setStep("time")}
              className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continue
            </button>
          )}

          {step === "time" && (
            <button
              disabled={!selectedDay || !selectedTime}
              onClick={() => setStep("confirm")}
              className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continue
            </button>
          )}

          {step === "confirm" && (
            <button
              disabled={contactPhone.trim().length < 7}
              onClick={() =>
                setStep(appointmentType === "group" ? "checkout" : "payment-choice")
              }
              className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-40"
            >
              Book
            </button>
          )}

          {step === "checkout" && (
            <button
              disabled={mobileNumber.trim().length < 7}
              onClick={() => setStep("otp")}
              className="ml-auto rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Confirm
            </button>
          )}

          {step === "otp" && (
            <button
              disabled={otp.some((d) => d === "") || saving}
              onClick={async () => {
                const ok = await saveBooking({ paid: true });
                if (ok) setStep("success");
              }}
              className="ml-auto rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Confirming..." : "Confirm"}
            </button>
          )}

          {step === "success" && (
            <button
              onClick={close}
              className="ml-auto rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
