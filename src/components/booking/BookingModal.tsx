"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Gift, Hourglass, MapPin, Phone, Star, Upload, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  branchContacts,
  timeSlots,
  type BranchService,
} from "@/lib/data";
import type { BookableService } from "@/components/booking/BookingContext";
import StaffProfileDetails from "@/components/booking/StaffProfileDetails";
import { createClient } from "@/lib/supabase/client";
import { useServiceTimingClock } from "@/lib/serviceTiming";
import { isSlotPast } from "@/lib/slotTime";
import { getStaffShiftsForRange, toDateKey, type StaffOffRecord } from "@/lib/supabase/queries/staffShifts";
import { getStaffTransferredIntoBranch, getApprovedTransferDatesForBranch } from "@/lib/supabase/queries/branchTransferRequests";
import {
  getProfessionalAppointmentsForRange,
  isProfessionalFreeNow,
  isSlotFree,
  type BookedSlot,
} from "@/lib/supabase/queries/availability";
import { toAppointmentServiceRows } from "@/lib/bookedServices";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { preselectService } from "@/lib/bookingPreselect";
import {
  formatMinutes,
  packageDepartments,
  packageMinutes,
  promoLengths,
  promoNotes,
  promoOpenOn,
  promoPriceFor,
  regularPrice,
  type PromoLength,
  type PromoPackage,
} from "@/lib/promoPackage";
import { formatGcashNumber, pesoAmount, receiptFileError } from "@/lib/payNow";
import {
  getGcashSettings,
  submitPayNowPayment,
  uploadPaymentReceipt,
  type GcashSettings,
} from "@/lib/supabase/queries/payNow";

type StaffMember = {
  id: string;
  full_name: string;
  department: string;
  phone: string | null;
  avatar_url: string | null;
};

function parseTime12h(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const p = m[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function isOpenNow(hours: string, now: Date): boolean {
  const parts = hours.split(" - ");
  if (parts.length !== 2) return false;
  const open = parseTime12h(parts[0]);
  const close = parseTime12h(parts[1]);
  if (open == null || close == null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= open && cur < close;
}

type SpaPackage = {
  id: string;
  badge: string;
  price: number;
  description: string;
};

type DbService = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string;
  price: number;
  displayPrice: string;
  serviceType: string | null;
  hairPrices: { short: number; medium: number; long: number } | null;
  price41: number | null;
};

function getPackageLabel(category: string): string {
  if (category === "Cocktail Drips") return "5+2";
  if (category === "Laser Services") return "4+1";
  return "2+1";
}

type Step =
  | "promo"
  | "type"
  | "branch"
  | "services"
  | "professional"
  | "time"
  | "confirm"
  | "payment-choice"
  | "checkout"
  | "success";

type AppointmentType = "solo" | "group";

const TABS: { id: Step; label: string }[] = [
  { id: "branch", label: "Branches" },
  { id: "services", label: "Services" },
  { id: "professional", label: "Professional" },
  { id: "time", label: "Time" },
  { id: "confirm", label: "Confirm" },
];

// Promo package: the services come with the promo, so there's no Services step.
const PROMO_TABS: { id: Step; label: string }[] = [
  { id: "promo", label: "Promo" },
  { id: "branch", label: "Branches" },
  { id: "professional", label: "Professional" },
  { id: "time", label: "Time" },
  { id: "confirm", label: "Confirm" },
];

const LENGTH_LABEL: Record<PromoLength, string> = { short: "Short", medium: "Medium", long: "Long" };


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

function generateTimeSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  let h = startHour;
  let m = 0;
  while (h * 60 + m <= endHour * 60) {
    const meridiem = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    slots.push(`${h12}:${m.toString().padStart(2, "0")} ${meridiem}`);
    m += 30;
    if (m >= 60) { m -= 60; h++; }
  }
  return slots;
}

const BRANCH_TIME_SLOTS: Record<string, string[]> = {
  "one-cecilia-center": generateTimeSlots(8, 18),
  "robinson-mall": generateTimeSlots(10, 20),
};

function isBeforeToday(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function parseDurationMinutes(durationLabel: string | null | undefined) {
  if (!durationLabel) return 60;
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

function isFullDayOff(date: Date, offDays: StaffOffRecord[]) {
  const key = toDateKey(date);
  return offDays.some((r) => r.shift_date === key && r.period === "full_day");
}

function periodOffForDate(date: Date, offDays: StaffOffRecord[]): "morning" | "afternoon" | null {
  const key = toDateKey(date);
  const record = offDays.find(
    (r) => r.shift_date === key && (r.period === "morning" || r.period === "afternoon")
  );
  return record ? (record.period as "morning" | "afternoon") : null;
}

function isSlotAfterCutoff(time: string) {
  const hour24 = Number(to24Hour(time).split(":")[0]);
  return hour24 >= 13;
}

export default function BookingModal({
  service,
  onClose,
  promoOptions,
}: {
  service: BookableService;
  onClose: () => void;
  /** Booking a promo package: the promo at each branch that offers it (first = the one clicked). */
  promoOptions?: PromoPackage[];
}) {
  const isPromo = !!promoOptions?.length;
  // "Book Now" on a service: it's pre-added once the client picks a branch.
  const preselect = !isPromo && service.preselect ? service : null;
  const preselectBranch = preselect?.branchId && branchContacts.some((b) => b.id === preselect.branchId) ? preselect.branchId : null;
  const [step, setStep] = useState<Step>(isPromo ? "promo" : preselect ? (preselectBranch ? "services" : "branch") : "type");
  // Only one branch offers it: pick that branch straight away.
  const [branchId, setBranchId] = useState<string | null>(() =>
    promoOptions?.length === 1 ? branchContacts.find((b) => b.name === promoOptions[0].branchName)?.id ?? null : preselectBranch
  );
  // Which branch the service was already pre-added for (so removing it sticks).
  const preselectedFor = useRef<string | null>(null);
  // "Book with Ms. X": choose that professional once, when they fit the booking.
  const preselectedStaff = useRef(false);
  const [preselectNote, setPreselectNote] = useState<string | null>(null);
  const [promoId, setPromoId] = useState<string | null>(promoOptions?.[0]?.id ?? null);
  const [promoLength, setPromoLength] = useState<PromoLength | null>(null);
  const promo = isPromo ? promoOptions!.find((p) => p.id === promoId) ?? promoOptions![0] : null;
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("solo");
  const [, setPayLater] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [selectedServices, setSelectedServices] = useState<BranchService[]>([]);
  const [professionalId, setProfessionalId] = useState<string | "any" | null>(
    null
  );
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState("");
  // Pay Now (059): GCash details from Admin, the client's receipt, and the
  // saved booking id so a failed receipt submit can be retried.
  const [gcash, setGcash] = useState<GcashSettings | null>(null);
  const [gcashBranch, setGcashBranch] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [gcashReference, setGcashReference] = useState("");
  const [senderName, setSenderName] = useState("");
  const [savedAppointmentId, setSavedAppointmentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Live clock (30s tick) so today's passed time slots disable themselves.
  const now = useServiceTimingClock();
  // Shown on the time step when a chosen time passed before the booking was saved.
  const [timeNotice, setTimeNotice] = useState<string | null>(null);
  // What was actually saved, for the summary on the final screen.
  const [savedBooking, setSavedBooking] = useState<{ code: string; confirmed: boolean; payNow?: boolean } | null>(null);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [branchUuid, setBranchUuid] = useState<string | null>(null);
  const [dbServices, setDbServices] = useState<DbService[]>([]);
  const [spaPackages, setSpaPackages] = useState<SpaPackage[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [profileMember, setProfileMember] = useState<StaffMember | null>(null);
  const [zoomedAvatar, setZoomedAvatar] = useState<string | null>(null);
  const [showSelectedPanel, setShowSelectedPanel] = useState(false);
  const [staffOffDays, setStaffOffDays] = useState<StaffOffRecord[]>([]);
  const [professionalBookings, setProfessionalBookings] = useState<Record<string, BookedSlot[]>>({});
  const [transferGuestIds, setTransferGuestIds] = useState<Set<string>>(new Set());
  const [transferAllowedDates, setTransferAllowedDates] = useState<Set<string>>(new Set());
  const [branchHours, setBranchHours] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) { setBranchHours(null); return; }
    const selectedBranchContact = branchContacts.find((b) => b.id === branchId);
    if (!selectedBranchContact) { setBranchHours(null); return; }
    const supabase = createClient();
    supabase
      .from("branches")
      .select("hours")
      .eq("name", selectedBranchContact.name)
      .maybeSingle()
      .then(({ data }) => setBranchHours((data?.hours as string) ?? null));
  }, [branchId]);

  useEffect(() => {
    setBranchUuid(null);
    setDbServices([]);
    setSpaPackages([]);
    setSelectedServices([]);
    setCategoryId("");
    setShowSelectedPanel(false);
  }, [branchId]);

  useEffect(() => {
    if (step !== "services" || !branchId) return;
    setServicesLoading(true);
    setDbServices([]);
    setSpaPackages([]);
    const selectedBranch = branchContacts.find((b) => b.id === branchId);
    if (!selectedBranch) { setServicesLoading(false); return; }
    const supabase = createClient();
    (async () => {
      let uuid = branchUuid;
      if (!uuid) {
        const { data: branchRow } = await supabase
          .from("branches")
          .select("id")
          .eq("name", selectedBranch.name)
          .maybeSingle();
        if (!branchRow) { setServicesLoading(false); return; }
        uuid = branchRow.id;
        setBranchUuid(uuid);
      }

      if (appointmentType === "group") {
        const { data: promos } = await supabase
          .from("branch_promotions")
          .select("id, badge, price, description")
          .eq("branch_id", uuid)
          .eq("category", "Spa Package")
          .order("price");
        setSpaPackages((promos ?? []) as SpaPackage[]);
        setServicesLoading(false);
        return;
      }

      const { data } = await supabase
        .from("branch_services")
        .select("id, name, category, department, duration, price, price_41, hair_options, facial_options, brows_type, body_wellness_type, laser_type, slimming_type, non_surgical_type, doctor_type, addons")
        .eq("branch_id", uuid)
        .eq("status", "Active")
        .order("category")
        .order("name");
      const services: DbService[] = (data ?? []).map((s: {
        id: string; name: string; category: string; department: string; duration: string;
        price: number; price_41: number | null;
        hair_options: { type?: string; subType?: string | null; prices?: { short: string; medium: string; long: string } } | null;
        facial_options: { isPremium?: boolean } | null;
        brows_type: string | null; body_wellness_type: string | null;
        laser_type: string | null; slimming_type: string | null;
        non_surgical_type: string | null; doctor_type: string | null;
        addons: { hasAddons?: boolean }[] | null;
      }) => {
        let displayPrice = `₱${(s.price ?? 0).toLocaleString()}.00`;
        let price = s.price ?? 0;
        let hairPrices: DbService["hairPrices"] = null;
        const price41 = s.price_41 ?? null;
        if (s.hair_options?.prices) {
          const p = s.hair_options.prices;
          const parse = (v: string) => Number(String(v).replace(/,/g, ""));
          hairPrices = { short: parse(p.short), medium: parse(p.medium), long: parse(p.long) };
          const vals = [hairPrices.short, hairPrices.medium, hairPrices.long].filter((v) => !isNaN(v) && v > 0);
          if (vals.length > 0) { price = Math.min(...vals); displayPrice = `From ₱${price.toLocaleString()}`; }
        }
        let serviceType: string | null = null;
        switch (s.category) {
          case "Brows & Lashes": serviceType = s.brows_type; break;
          case "Body & Wellness": serviceType = s.body_wellness_type; break;
          case "Laser Services": serviceType = s.laser_type; break;
          case "Slimming Services": serviceType = s.slimming_type; break;
          case "Non-Surgical Liposuction": serviceType = s.non_surgical_type; break;
          case "Doctor's Procedure": serviceType = s.doctor_type; break;
          case "Hair Services": {
            const h = s.hair_options;
            if (h?.type) serviceType = h.subType ? `${h.type} · ${h.subType}` : h.type;
            break;
          }
          case "Facial Services":
            serviceType = s.facial_options?.isPremium ? "Premium" : null;
            break;
          case "Nail Care":
            serviceType = s.addons?.some((a) => a.hasAddons) ? "Add On" : null;
            break;
        }
        return { id: s.id, name: s.name, category: s.category, department: s.department, duration: s.duration, price, displayPrice, serviceType, hairPrices, price41 };
      });
      setDbServices(services);
      const cats = Array.from(new Set(services.map((s) => s.category)));
      if (cats.length > 0) setCategoryId(cats[0]);

      // Pre-add the service the client tapped "Book Now" on, once per branch.
      if (preselect && preselectedFor.current !== branchId) {
        preselectedFor.current = branchId;
        const picked = preselectService({ name: preselect.name, category: preselect.category }, services);
        const branchName = branchContacts.find((b) => b.id === branchId)?.name ?? "this branch";
        const wantedCategory = preselect.category ?? "";
        if (!preselect.name.trim()) {
          // "Book a Treatment" while browsing a category: open on that tab.
          if (wantedCategory && cats.includes(wantedCategory)) {
            setCategoryId(wantedCategory);
            setPreselectNote(`Showing ${wantedCategory}. Select the services you want.`);
          } else if (wantedCategory) {
            setPreselectNote(`${wantedCategory} isn't offered at ${branchName}. Choose another branch or category.`);
          }
        } else if (picked.kind === "added") {
          setSelectedServices((prev) => (prev.some((s) => s.id === picked.entry.id) ? prev : [...prev, picked.entry]));
          setCategoryId(picked.category);
          setShowSelectedPanel(true);
          setPreselectNote(`${picked.entry.name} is already in your Selected Services. Add more, or tap Continue.`);
        } else if (picked.kind === "choose_length") {
          setCategoryId(picked.category);
          setPreselectNote(`Choose your hair length for ${picked.service.name} below.`);
        } else {
          setPreselectNote(`${preselect.name} isn't offered at ${branchName}. Choose another branch or service.`);
        }
      }
      setServicesLoading(false);
    })();
  }, [step, branchId, appointmentType]);

  useEffect(() => {
    if (step !== "professional" || !branchId) return;
    const selectedBranch = branchContacts.find((b) => b.id === branchId);
    if (!selectedBranch) return;
    setStaffLoading(true);
    setStaffMembers([]);
    const supabase = createClient();
    (async () => {
      let uuid = branchUuid;
      if (!uuid) {
        const { data: branchRow } = await supabase
          .from("branches")
          .select("id")
          .eq("name", selectedBranch.name)
          .maybeSingle();
        if (!branchRow) { setStaffLoading(false); return; }
        uuid = branchRow.id;
        setBranchUuid(uuid);
      }
      if (!uuid) { setStaffLoading(false); return; }
      const branchIdResolved = uuid;
      const [homeStaffRes, transferredIn] = await Promise.all([
        supabase
          .from("staff_members")
          .select("id, full_name, department, phone, avatar_url")
          .eq("branch_id", branchIdResolved)
          .order("department")
          .order("full_name"),
        getStaffTransferredIntoBranch(supabase, branchIdResolved),
      ]);
      const homeStaff = (homeStaffRes.data as StaffMember[]) ?? [];
      const homeIds = new Set(homeStaff.map((s) => s.id));
      // A staff member whose home branch is now this one (e.g. reassigned
      // after an old transfer here) is already in homeStaff — treating
      // them as a guest too would duplicate them and wrongly restrict
      // their dates to a stale transfer's date list.
      const transferredInNotHome = transferredIn.filter((t) => !homeIds.has(t.staffMemberId));
      const guests: StaffMember[] = transferredInNotHome.map((t) => ({
        id: t.staffMemberId,
        full_name: t.fullName,
        department: t.department ?? "",
        phone: t.phone,
        avatar_url: t.avatarUrl,
      }));
      setStaffMembers([...homeStaff, ...guests]);
      setTransferGuestIds(new Set(transferredInNotHome.map((t) => t.staffMemberId)));
      // Booked from a team member: select them if they work here and do the chosen services.
      const wanted = preselect?.staffId ? [...homeStaff, ...guests].find((s) => s.id === preselect.staffId) : null;
      const depts = new Set(selectedServices.map((s) => s.department).filter(Boolean));
      if (wanted && !preselectedStaff.current && (depts.size === 0 || depts.has(wanted.department))) {
        preselectedStaff.current = true;
        setProfessionalId(wanted.id);
      }
      setStaffLoading(false);
    })();
  }, [step, branchId]);

  useEffect(() => {
    if (!professionalId || professionalId === "any") {
      setStaffOffDays([]);
      setProfessionalBookings({});
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    getStaffShiftsForRange(
      supabase,
      professionalId,
      toDateKey(monthStart),
      toDateKey(monthEnd)
    ).then((records) => {
      if (!cancelled) setStaffOffDays(records);
    });
    getProfessionalAppointmentsForRange(
      supabase,
      professionalId,
      toDateKey(monthStart),
      toDateKey(monthEnd)
    ).then((byDate) => {
      if (!cancelled) setProfessionalBookings(byDate);
    });
    return () => {
      cancelled = true;
    };
  }, [professionalId, calendarMonth]);

  useEffect(() => {
    if (!professionalId || professionalId === "any" || !transferGuestIds.has(professionalId) || !branchUuid) {
      setTransferAllowedDates(new Set());
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    getApprovedTransferDatesForBranch(supabase, professionalId, branchUuid).then((dates) => {
      if (!cancelled) setTransferAllowedDates(new Set(dates));
    });
    return () => {
      cancelled = true;
    };
  }, [professionalId, transferGuestIds, branchUuid]);

  useEffect(() => {
    setSelectedDay(null);
    setSelectedTime(null);
  }, [professionalId]);

  // The selected branch's GCash details and Pay Now switch (060), loaded
  // when the client reaches the payment steps.
  useEffect(() => {
    if ((step !== "checkout" && step !== "payment-choice") || !branchUuid) return;
    if (gcash && gcashBranch === branchUuid) return;
    let cancelled = false;
    getGcashSettings(createClient(), branchUuid).then((s) => {
      if (cancelled) return;
      setGcash(s);
      setGcashBranch(branchUuid);
    });
    return () => {
      cancelled = true;
    };
  }, [step, gcash, gcashBranch, branchUuid]);

  // Free the receipt preview's memory when it's replaced or the form closes.
  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    };
  }, [receiptPreview]);

  function chooseReceipt(file: File | null | undefined) {
    if (!file) return;
    const problem = receiptFileError(file);
    if (problem) {
      setReceiptError(problem);
      return;
    }
    setReceiptError(null);
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  }

  const selectedDate = useMemo(() => {
    if (!selectedDay) return null;
    return new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), selectedDay);
  }, [calendarMonth, selectedDay]);

  // A chosen time that passes while the client is still on the time step is
  // cleared, so Continue can't carry a past slot forward (render-time update,
  // the React-recommended alternative to a setState-in-effect).
  const selectedTimePassed = !!selectedDate && !!selectedTime && isSlotPast(selectedDate, selectedTime, now);
  if (step === "time" && selectedTimePassed) {
    setSelectedTime(null);
  }

  const branch = branchContacts.find((b) => b.id === branchId) ?? branchContacts[0];

  const professionalLabel =
    professionalId === "any" || !professionalId
      ? "any professional"
      : staffMembers.find((p) => p.id === professionalId)?.full_name ?? "any professional";

  // A promo's included services (or the promo itself when none are listed yet).
  const promoItems: BranchService[] = promo
    ? promo.services.length
      ? promo.services.map((s) => ({ id: s.id, name: s.name, category: s.category, department: s.department, duration: s.duration ?? "60 mins", price: s.price }))
      : [{ name: promo.title, category: promo.category ?? "Promo", department: promo.department ?? "", duration: "60 mins", price: promo.price ?? 0 }]
    : [];
  const lineItems = promo ? promoItems : selectedServices;
  const promoSizes = promo ? promoLengths(promo) : [];
  const promoPrice = promo ? promoPriceFor(promo, promoSizes.length ? promoLength : null) : null;
  const promoRegular = promo ? regularPrice(promo) : null;
  const promoDepts = promo ? packageDepartments(promo) : [];
  // Several departments: no single professional can do the whole package.
  const promoNeedsTeam = promoDepts.length > 1;
  const subtotal = lineItems.reduce((sum, s) => sum + s.price, 0);
  // A promo is charged at the package price, not the services added up.
  const total = promo ? promoPrice ?? 0 : subtotal;
  const payNowDisabled = branchHours ? !isOpenNow(branchHours, new Date()) : false;
  // The selected branch's GCash setup (060); Pay Now is off until Admin completes it.
  const branchGcash = gcash && gcashBranch === branchUuid ? gcash : null;
  const payNowOff = !!branchGcash && !branchGcash.payNowEnabled;
  const totalDuration = promo ? packageMinutes(promo) : selectedServices.reduce((sum, s) => sum + parseDurationMinutes(s.duration), 0);
  const serviceNames = promo
    ? `${promo.title}${promoSizes.length && promoLength ? ` (${LENGTH_LABEL[promoLength]})` : ""}`
    : selectedServices.map((s) => s.name).join(", ");

  function close() {
    onClose();
  }

  /** Pay Now: upload the receipt, save the booking as Pending, then submit the
   * payment for the Front Desk to verify. Nothing here confirms the booking. */
  async function submitPayNow() {
    if (!receiptFile) {
      setReceiptError("Please upload your GCash receipt before submitting.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setSaveError("You must be logged in to book.");
      setSaving(false);
      return;
    }
    const upload = await uploadPaymentReceipt(supabase, authData.user.id, receiptFile);
    if (!upload.path) {
      setSaveError(upload.error);
      setSaving(false);
      return;
    }
    const appointmentId = savedAppointmentId ?? (await saveBooking());
    if (!appointmentId) return;
    setSavedAppointmentId(appointmentId);
    setSaving(true);
    const { error } = await submitPayNowPayment(supabase, {
      appointmentId,
      amount: total,
      receiptPath: upload.path,
      referenceNo: gcashReference,
      senderName,
    });
    setSaving(false);
    if (error) {
      setSaveError(`Your booking was saved, but the receipt wasn't submitted: ${error} Tap Submit again.`);
      return;
    }
    setSavedBooking((prev) => (prev ? { ...prev, payNow: true } : prev));
    setStep("success");
  }

  /** Saves the booking as Pending and returns its id (null on failure). */
  async function saveBooking(): Promise<string | null> {
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setSaveError("You must be logged in to book.");
        setSaving(false);
        return null;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("restricted")
        .eq("id", authData.user.id)
        .single();
      if (profile?.restricted) {
        setSaveError("Your account has been restricted. Please contact us for assistance.");
        setSaving(false);
        return null;
      }

      const { data: branchRow } = await supabase
        .from("branches")
        .select("id")
        .eq("name", branch.name)
        .maybeSingle();

      if (!branchRow || !selectedDate || !selectedTime) {
        setSaveError("Missing branch, date, or time.");
        setSaving(false);
        return null;
      }

      // Final guard: the chosen slot may have passed while the client was
      // on the confirm/payment steps. Never save a booking in the past.
      if (isSlotPast(selectedDate, selectedTime, new Date())) {
        setTimeNotice("That time has already passed. Please pick a later time.");
        setSelectedTime(null);
        setStep("time");
        setSaving(false);
        return null;
      }

      if (professionalId && professionalId !== "any") {
        const dateKey = toDateKey(selectedDate);
        if (transferGuestIds.has(professionalId)) {
          const [transferResult, shiftResult] = await Promise.all([
            supabase
              .from("branch_transfer_requests")
              .select("dates")
              .eq("staff_member_id", professionalId)
              .eq("target_branch_id", branchRow.id)
              .eq("status", "approved"),
            supabase
              .from("staff_shifts")
              .select("period, source")
              .eq("staff_member_id", professionalId)
              .eq("shift_date", dateKey),
          ]);
          if (transferResult.error || shiftResult.error) {
            setSaveError("Couldn't verify therapist availability. Please try again.");
            setSaving(false);
            return null;
          }
          const allowedDates = new Set(
            ((transferResult.data as { dates: string[] }[]) ?? []).flatMap((r) => r.dates)
          );
          // A genuine leave/manual block (anything not tagged "transfer") on this exact
          // date overrides the transfer — they're unavailable everywhere that day.
          const genuineConflicts = (
            (shiftResult.data as { period: StaffOffRecord["period"]; source: string }[]) ?? []
          ).filter((r) => r.source !== "transfer");
          const overriddenByLeave = genuineConflicts.some(
            (r) =>
              r.period === "full_day" ||
              (r.period === "morning" && !isSlotAfterCutoff(selectedTime)) ||
              (r.period === "afternoon" && isSlotAfterCutoff(selectedTime))
          );
          if (!allowedDates.has(dateKey) || overriddenByLeave) {
            setSaveError("This professional just became unavailable for that date/time. Please pick another slot.");
            setSaving(false);
            return null;
          }
        } else {
          const { data: conflictRows, error: conflictError } = await supabase
            .from("staff_shifts")
            .select("period")
            .eq("staff_member_id", professionalId)
            .eq("shift_date", dateKey);
          if (conflictError) {
            setSaveError("Couldn't verify therapist availability. Please try again.");
            setSaving(false);
            return null;
          }
          const conflicts = (conflictRows as { period: StaffOffRecord["period"] }[]) ?? [];
          const blockingConflict = conflicts.some(
            (r) =>
              r.period === "full_day" ||
              (r.period === "morning" && !isSlotAfterCutoff(selectedTime)) ||
              (r.period === "afternoon" && isSlotAfterCutoff(selectedTime))
          );
          if (blockingConflict) {
            setSaveError("This professional just became unavailable for that date/time. Please pick another slot.");
            setSaving(false);
            return null;
          }
        }

        // Final race-condition check: someone else (online or a walk-in) may have
        // taken this exact slot with this professional between page load and now.
        const stillFree = await isProfessionalFreeNow(supabase, {
          professionalId,
          scheduledDate: dateKey,
          startTime: to24Hour(selectedTime),
          durationMinutes: totalDuration,
        });
        if (!stillFree) {
          setSaveError("This time slot was just taken with that professional. Please pick another.");
          setSaving(false);
          return null;
        }
      }

      const bookingCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      const scheduledDate = `${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${selectedDate.getDate().toString().padStart(2, "0")}`;

      const row: Record<string, unknown> = {
          booking_code: bookingCode,
          branch_id: branchRow.id,
          client_id: authData.user.id,
          professional_id: professionalId && professionalId !== "any" ? professionalId : null,
          appointment_type: appointmentType,
          scheduled_date: scheduledDate,
          start_time: to24Hour(selectedTime),
          duration_minutes: totalDuration,
          // Always Pending: Pay Now bookings wait for the Front Desk to verify the GCash payment.
          status: "pending",
          notes: promo
            ? promoNotes(serviceNames, professionalLabel, total)
            : `${serviceNames} with ${professionalLabel} — ₱${total.toLocaleString()}.00`,
      };
      const insertAppt = (values: Record<string, unknown>) => supabase.from("appointments").insert(values).select("id").single();
      // A promo booking remembers its promo and the package price (067).
      let { data: appt, error } = await insertAppt(promo ? { ...row, promotion_id: promo.id, promo_price: total } : row);
      if (promo && error && isNotMigratedError(error)) ({ data: appt, error } = await insertAppt(row));
      if (error?.message?.startsWith("PROMO_INVALID")) {
        setSaveError(error.message.replace(/^PROMO_INVALID:\s*/, "Sorry — ") + ".");
        setSaving(false);
        return null;
      }

      if (error || !appt) {
        setSaveError(error?.message ?? "Failed to save booking.");
        setSaving(false);
        return null;
      }

      const { error: servicesError } = await supabase
        .from("appointment_services")
        .insert(toAppointmentServiceRows(appt.id, lineItems));
      // The booking itself is already saved; a missing list only means
      // reviews fall back to the notes text. Never fail the booking over it.
      if (servicesError) logQueryError("BookingModal appointment_services", servicesError);

      if (contactPhone.trim()) {
        await supabase
          .from("profiles")
          .update({ phone: `+63 ${formatPhoneInput(contactPhone)}` })
          .eq("id", authData.user.id);
      }

      setSavedBooking({ code: bookingCode, confirmed: false });
      setSaving(false);
      return appt.id as string;
    } catch {
      setSaveError("Network error — could not save booking.");
      setSaving(false);
      return null;
    }
  }

  function goToTab(tab: Step) {
    const order: Step[] = promo ? PROMO_TABS.map((t) => t.id) : ["branch", "services", "professional", "time", "confirm"];
    if (order.indexOf(tab) <= order.indexOf(step)) setStep(tab);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:px-4 sm:py-8">
      <div className="flex h-[100dvh] w-full max-w-2xl flex-col bg-white sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="truncate text-xl font-bold italic text-ink sm:text-2xl" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>Blush Spa &amp; Aesthetics</p>
            {branchId && (
              <p className="mt-0.5 text-sm text-ink/65 sm:text-base">
                {branchContacts.find((b) => b.id === branchId)?.name ?? ""}
              </p>
            )}
          </div>
          <button onClick={close} aria-label="Close" className="-mr-1 shrink-0 rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-ink">
            <X className="h-6 w-6 sm:h-5 sm:w-5" />
          </button>
        </div>

        {step !== "type" &&
          step !== "payment-choice" &&
          step !== "checkout" &&
          step !== "success" && (
          <div className="scrollbar-hidden flex overflow-x-auto border-b border-ink/10 px-2 sm:px-6">
            {(promo ? PROMO_TABS : TABS).filter((tab) => !(appointmentType === "group" && tab.id === "professional")).map((tab) => (
              <button
                key={tab.id}
                onClick={() => goToTab(tab.id)}
                className={`shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium sm:px-4 sm:text-base ${
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

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
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
                <p className="font-semibold text-ink">Spa Party Packages</p>
                <p className="mt-1 text-sm text-ink/60">Exclusive packages for groups</p>
                <span className="mt-4 inline-block rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white">
                  Book Now
                </span>
              </button>
            </div>
          )}

          {step === "promo" && promo && (
            <div className="space-y-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-champagne/50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-coral-dark">
                  <Gift className="h-3.5 w-3.5" /> Promo Package
                </span>
                <p className="mt-3 text-sm text-ink/50">You&apos;re booking</p>
                <h3 className="text-xl font-semibold leading-snug text-ink">{promo.title}</h3>
                {promo.description && <p className="mt-1 text-sm text-ink/60">{promo.description}</p>}
              </div>

              <div className="rounded-2xl border border-champagne bg-cream/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">✨ Included Services</p>
                {promo.services.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {promo.services.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 text-ink">
                          <Check className="h-4 w-4 shrink-0 text-coral-dark" /> {s.name}
                        </span>
                        <span className="shrink-0 text-xs text-ink/50">{s.duration ?? "60 mins"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 flex items-center gap-2 text-sm text-ink">
                    <Check className="h-4 w-4 text-coral-dark" /> {promo.title}
                  </p>
                )}
                <p className="mt-3 flex items-center gap-1.5 border-t border-champagne/70 pt-3 text-sm text-ink/70">
                  <Clock className="h-4 w-4 text-coral-dark" /> Estimated duration: <span className="font-semibold text-ink">{formatMinutes(totalDuration)}</span>
                </p>
              </div>

              {promoSizes.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-ink">Hair length</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {promoSizes.map((s) => (
                      <button
                        key={s.length}
                        type="button"
                        aria-pressed={promoLength === s.length}
                        onClick={() => setPromoLength(s.length)}
                        className={`rounded-xl border px-3 py-2 text-center text-sm transition ${
                          promoLength === s.length ? "border-coral bg-blush font-semibold text-coral-dark" : "border-ink/15 text-ink/70 hover:border-coral"
                        }`}
                      >
                        {LENGTH_LABEL[s.length]}
                        <span className="block text-xs">₱{s.price.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-champagne">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">💰 Promo Price</p>
                  <p className="text-2xl font-bold text-coral-dark">
                    {promoPrice != null && (!promoSizes.length || promoLength) ? `₱${promoPrice.toLocaleString()}.00` : promoSizes.length ? "Pick a hair length" : "—"}
                  </p>
                  {promoRegular != null && promoPrice != null && promoRegular > promoPrice && (
                    <p className="text-sm text-ink/50">
                      Regular price <span className="line-through">₱{promoRegular.toLocaleString()}.00</span>
                    </p>
                  )}
                </div>
                {promoRegular != null && promoPrice != null && promoRegular > promoPrice && (
                  <span className="rounded-full bg-[#e8f5e9] px-3 py-1 text-sm font-semibold text-[#2e7d32]">
                    Save ₱{(promoRegular - promoPrice).toLocaleString()}
                  </span>
                )}
              </div>
              {promo.validUntil && (
                <p className="text-xs text-ink/50">
                  Promo ends {new Date(`${promo.validUntil}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
          )}

          {step === "branch" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Choose a branch</p>
                <button
                  onClick={() => setStep(promo ? "promo" : "type")}
                  className="text-base font-medium text-ink/50 hover:text-ink"
                >
                  ← Back
                </button>
              </div>
              {(promo
                ? branchContacts.filter((b) => promoOptions!.some((p) => p.branchName === b.name))
                : appointmentType === "group"
                  ? branchContacts.filter((b) => b.id === "one-cecilia-center")
                  : branchContacts
              ).map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setBranchId(b.id);
                    // The same promo at this branch (its own services and staff).
                    const atBranch = promoOptions?.find((p) => p.branchName === b.name);
                    if (atBranch) setPromoId(atBranch.id);
                  }}
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

          {step === "services" && appointmentType === "group" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-ink">Choose a package</p>
                <button
                  onClick={() => setStep("branch")}
                  className="text-base font-medium text-ink/50 hover:text-ink"
                >
                  ← Back
                </button>
              </div>
              {servicesLoading ? (
                <div className="py-12 text-center text-sm text-ink/40">Loading packages...</div>
              ) : spaPackages.length === 0 ? (
                <div className="py-12 text-center text-sm text-ink/40">No spa packages available.</div>
              ) : (
                <div className="space-y-4">
                  {spaPackages.map((pkg) => {
                    const isSelected = selectedServices.some((s) => s.id === pkg.id);
                    const inclusions = pkg.description ? pkg.description.split("\n").filter(Boolean) : [];
                    return (
                      <button
                        key={pkg.id}
                        onClick={() => setSelectedServices([{ id: pkg.id, name: `${pkg.badge} Spa Package`, category: "Spa Package", department: "Spa", duration: "3 hrs", price: pkg.price }])}
                        className={`w-full rounded-2xl border p-5 text-left transition ${isSelected ? "border-coral bg-blush" : "border-ink/10 hover:border-coral/50"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`rounded-full border px-3 py-0.5 text-xs font-bold tracking-wider ${isSelected ? "border-coral text-coral-dark" : "border-gold text-gold"}`}>{pkg.badge}</span>
                          <span className="text-xl font-bold text-ink">Php {pkg.price.toLocaleString()}</span>
                        </div>
                        {inclusions.length > 0 && (
                          <ul className="mt-3 space-y-1">
                            {inclusions.map((inc, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-ink/70">
                                <span className="mt-0.5 text-gold">✓</span>
                                {inc}
                              </li>
                            ))}
                          </ul>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === "services" && appointmentType !== "group" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-ink">Choose services</p>
                <button
                  onClick={() => setStep("branch")}
                  className="text-base font-medium text-ink/50 hover:text-ink"
                >
                  ← Back
                </button>
              </div>
              {preselectNote && !servicesLoading && (
                <p className="mb-4 flex items-start gap-2 rounded-xl bg-cream px-4 py-3 text-sm text-ink/75 ring-1 ring-champagne">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-coral-dark" /> {preselectNote}
                </p>
              )}
              {servicesLoading ? (
                <div className="py-12 text-center text-sm text-ink/40">Loading services...</div>
              ) : dbServices.length === 0 ? (
                <div className="py-12 text-center text-sm text-ink/40">No services available for this branch.</div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(dbServices.map((s) => s.category))).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryId(cat)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                          categoryId === cat
                            ? "bg-coral text-white"
                            : "text-ink/50 hover:text-coral-dark"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 space-y-3">
                    {dbServices.filter((s) => s.category === categoryId).map((svc) => {
                      const isSelected = selectedServices.some((s) => s.id === svc.id);
                      if (svc.hairPrices) {
                        const sizes = [
                          { label: "Short", price: svc.hairPrices.short },
                          { label: "Medium", price: svc.hairPrices.medium },
                          { label: "Long", price: svc.hairPrices.long },
                        ] as const;
                        return (
                          <div key={svc.id} className="rounded-xl border border-ink/10 overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
                              <p className="font-medium text-ink">{svc.name}</p>
                              {svc.serviceType && (
                                <span className="rounded-full bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral-dark">
                                  {svc.serviceType}
                                </span>
                              )}
                            </div>
                            {sizes.map(({ label, price }) => {
                              const sizeId = `${svc.id}·${label}`;
                              const entryName = `${svc.name} · ${label}`;
                              const isSizeSelected = selectedServices.some((s) => s.id === sizeId);
                              return (
                                <div
                                  key={label}
                                  className={`flex items-center justify-between px-4 py-3 ${
                                    isSizeSelected ? "bg-blush" : ""
                                  }`}
                                >
                                  <span className="text-sm text-ink/70">{label}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="font-semibold text-gold">₱{price.toLocaleString()}</span>
                                    <button
                                      onClick={() => {
                                        if (isSizeSelected) {
                                          setSelectedServices((prev) => prev.filter((s) => s.id !== sizeId));
                                        } else {
                                          setSelectedServices((prev) => [
                                            ...prev.filter((s) => !s.id?.startsWith(`${svc.id}·`)),
                                            { id: sizeId, name: entryName, category: svc.category, department: svc.department, duration: svc.duration, price },
                                          ]);
                                        }
                                      }}
                                      className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                                        isSizeSelected
                                          ? "bg-coral text-white"
                                          : "border border-ink/15 text-ink/70 hover:border-coral"
                                      }`}
                                    >
                                      {isSizeSelected ? <Check className="h-3.5 w-3.5" /> : "Select"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }
                      if (svc.price41 && ["Slimming Services", "Premium Treatments", "Cocktail Drips", "Laser Services"].includes(svc.category)) {
                        const pkgLabel = getPackageLabel(svc.category);
                        const tiers = [
                          { tierId: `${svc.id}·per-session`, label: "Per Session", price: svc.price },
                          { tierId: `${svc.id}·pkg`, label: pkgLabel, price: svc.price41 },
                        ];
                        return (
                          <div key={svc.id} className="rounded-xl border border-ink/10 overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
                              <p className="font-medium text-ink">{svc.name}</p>
                              {svc.serviceType && (
                                <span className="rounded-full bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral-dark">
                                  {svc.serviceType}
                                </span>
                              )}
                              {svc.duration && <span className="text-xs text-ink/40">({svc.duration})</span>}
                            </div>
                            {tiers.map(({ tierId, label, price }) => {
                              const isTierSelected = selectedServices.some((s) => s.id === tierId);
                              return (
                                <div key={tierId} className={`flex items-center justify-between px-4 py-3 ${isTierSelected ? "bg-blush" : ""}`}>
                                  <span className="text-sm text-ink/70">{label}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="font-semibold text-gold">₱{price.toLocaleString()}</span>
                                    <button
                                      onClick={() => {
                                        if (isTierSelected) {
                                          setSelectedServices((prev) => prev.filter((s) => s.id !== tierId));
                                        } else {
                                          setSelectedServices((prev) => [
                                            ...prev.filter((s) => !tiers.some((t) => t.tierId === s.id)),
                                            { id: tierId, name: `${svc.name} · ${label}`, category: svc.category, department: svc.department, duration: svc.duration, price },
                                          ]);
                                        }
                                      }}
                                      className={`rounded-full px-4 py-1.5 text-xs font-semibold ${isTierSelected ? "bg-coral text-white" : "border border-ink/15 text-ink/70 hover:border-coral"}`}
                                    >
                                      {isTierSelected ? "Unselect" : "Select"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={svc.id}
                          className={`flex items-center justify-between rounded-xl border p-4 ${
                            isSelected ? "border-coral bg-blush" : "border-ink/10"
                          }`}
                        >
                          <div>
                            <p className="font-medium text-ink">{svc.name}</p>
                            {svc.serviceType && (
                              <span className="inline-block rounded-full bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral-dark">
                                {svc.serviceType}
                              </span>
                            )}
                            {svc.duration && (
                              <p className="text-xs text-ink/50">({svc.duration})</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gold">{svc.displayPrice}</span>
                            <button
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedServices((prev) => prev.filter((s) => s.id !== svc.id));
                                } else {
                                  setSelectedServices((prev) => [
                                    ...prev,
                                    { id: svc.id, name: svc.name, category: svc.category, department: svc.department, duration: svc.duration, price: svc.price },
                                  ]);
                                }
                              }}
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
                </>
              )}
            </div>
          )}

          {step === "professional" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Choose a professional</p>
                <button
                  onClick={() => setStep(promo ? "branch" : "services")}
                  className="text-base font-medium text-ink/50 hover:text-ink"
                >
                  ← Back
                </button>
              </div>
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

              {staffLoading && (
                <p className="py-6 text-center text-sm text-ink/40">Loading staff...</p>
              )}

              {!staffLoading && staffMembers.length === 0 && (
                <p className="py-6 text-center text-sm text-ink/40">No staff assigned to this branch yet.</p>
              )}

              {promo && promoNeedsTeam && (
                <p className="rounded-xl bg-cream px-4 py-3 text-sm text-ink/70">
                  This package includes {promoDepts.join(" and ")} services, so our front desk will assign the right specialist for each part.
                </p>
              )}

              {!staffLoading && !(promo && promoNeedsTeam) && (() => {
                const selectedDepts = new Set(lineItems.map((s) => s.department).filter(Boolean));
                const filteredStaff = selectedDepts.size > 0
                  ? staffMembers.filter((s) => selectedDepts.has(s.department))
                  : staffMembers;
                const departments = Array.from(new Set(filteredStaff.map((s) => s.department)));
                return departments.map((dept) => (
                  <div key={dept}>
                    <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink/40">{dept}</p>
                    {filteredStaff.filter((s) => s.department === dept).map((pro) => (
                      <div
                        key={pro.id}
                        className={`flex items-center justify-between rounded-xl border p-4 mb-2 ${
                          professionalId === pro.id ? "border-coral bg-blush" : "border-ink/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-sm font-bold text-coral-dark overflow-hidden">
                            {pro.avatar_url
                              ? <Image src={pro.avatar_url} alt={pro.full_name} fill className="object-cover" />
                              : pro.full_name.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <p className="font-medium text-ink">{pro.full_name}</p>
                            <p className="text-xs text-ink/50">{pro.department}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setProfileMember(pro)}
                            className="text-xs font-medium text-coral-dark hover:underline"
                          >
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
                ));
              })()}
            </div>
          )}

          {step === "time" && (
            <div className="space-y-4">
            {timeNotice && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{timeNotice}</p>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Pick a date & time</p>
              <button
                onClick={() => setStep(appointmentType === "group" ? "services" : "professional")}
                className="text-base font-medium text-ink/50 hover:text-ink"
              >
                ← Back
              </button>
            </div>
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
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <p className="text-base font-bold text-ink">
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
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-sm font-medium text-ink/40">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1 text-center text-base">
                  {buildMonthGrid(calendarMonth).map((day, i) => {
                    const cellDate = day
                      ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
                      : null;
                    const isPast = cellDate ? isBeforeToday(cellDate) : false;
                    const isTransferGuest = !!professionalId && transferGuestIds.has(professionalId);
                    // A transfer creates a "source: transfer" off-block at this person's home
                    // branch, covering the exact same dates the transfer already allows here —
                    // that block is expected and shouldn't count against them at the branch
                    // they're visiting. A genuine leave/manual off-block on the same date (any
                    // other source) still must, since it means they're unavailable everywhere.
                    const relevantOffDays = isTransferGuest
                      ? staffOffDays.filter((r) => r.source !== "transfer")
                      : staffOffDays;
                    const isStaffOff = cellDate ? isFullDayOff(cellDate, relevantOffDays) : false;
                    const isOutsideTransfer =
                      isTransferGuest && cellDate ? !transferAllowedDates.has(toDateKey(cellDate)) : false;
                    // Promo bookings only within the promo's start / end dates.
                    const isOutsidePromo = !!promo && !!cellDate && !promoOpenOn(promo, toDateKey(cellDate));
                    const isUnavailable = isStaffOff || isOutsideTransfer || isOutsidePromo;
                    const isDisabled = !day || isPast || isUnavailable;
                    return (
                      <button
                        key={i}
                        disabled={isDisabled}
                        onClick={() => day && !isDisabled && setSelectedDay(day)}
                        className={`aspect-square rounded-full ${
                          !day
                            ? ""
                            : isPast || isUnavailable
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
                {(() => {
                  const allSlots = BRANCH_TIME_SLOTS[branchId ?? ""] ?? timeSlots;
                  const isTransferGuest = !!professionalId && transferGuestIds.has(professionalId);
                  const relevantOffDays = isTransferGuest
                    ? staffOffDays.filter((r) => r.source !== "transfer")
                    : staffOffDays;
                  const offPeriod = selectedDate ? periodOffForDate(selectedDate, relevantOffDays) : null;
                  const bookedOnDate = selectedDate ? professionalBookings[toDateKey(selectedDate)] : undefined;
                  // A promo package must finish by closing time (the last slot of the day).
                  const closeAt = allSlots.length ? to24Hour(allSlots[allSlots.length - 1]) : null;
                  const closeMinutes = closeAt ? Number(closeAt.slice(0, 2)) * 60 + Number(closeAt.slice(3, 5)) : null;
                  const availableSlots = allSlots.filter((time) => {
                    if (promo && closeMinutes != null) {
                      const t = to24Hour(time);
                      if (Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + totalDuration > closeMinutes) return false;
                    }
                    if (offPeriod) {
                      const afterCutoff = isSlotAfterCutoff(time);
                      if (offPeriod === "morning" ? !afterCutoff : afterCutoff) return false;
                    }
                    if (professionalId && professionalId !== "any") {
                      return isSlotFree(bookedOnDate, to24Hour(time), totalDuration);
                    }
                    return true;
                  });

                  if (availableSlots.length === 0) {
                    return (
                      <p className="text-sm text-ink/50">
                        No available times for this therapist on this date.
                      </p>
                    );
                  }

                  // Only today's slots can have passed; future days are unaffected.
                  const passed = (time: string) => !!selectedDate && isSlotPast(selectedDate, time, now);
                  if (availableSlots.every(passed)) {
                    return (
                      <p className="text-sm text-ink/50">
                        No more times available today. Please choose another date.
                      </p>
                    );
                  }

                  return availableSlots.map((time) => {
                    const isPast = passed(time);
                    return (
                      <button
                        key={time}
                        disabled={isPast}
                        aria-disabled={isPast}
                        onClick={() => {
                          setSelectedTime(time);
                          setTimeNotice(null);
                        }}
                        className={`block w-full rounded-lg border px-3 py-2.5 text-base ${
                          isPast
                            ? "cursor-not-allowed border-ink/5 bg-ink/[0.03] text-ink/25"
                            : selectedTime === time
                              ? "border-coral bg-blush text-coral-dark"
                              : "border-ink/10 text-ink/70 hover:border-coral"
                        }`}
                      >
                        <span className={isPast ? "line-through" : undefined}>{time}</span>
                        {isPast && <span className="ml-2 text-xs no-underline">Passed</span>}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Booking summary</p>
                <button
                  onClick={() => setStep("time")}
                  className="text-base font-medium text-ink/50 hover:text-ink"
                >
                  ← Back
                </button>
              </div>
              {promo ? (
                <dl className="divide-y divide-ink/5 rounded-2xl border border-champagne text-sm">
                  <div className="flex items-center gap-2 bg-cream/60 px-4 py-2.5 font-semibold text-coral-dark">
                    <Gift className="h-4 w-4" /> Promo Package
                  </div>
                  {[
                    ["Promo", serviceNames],
                    ["Included Services", promo.services.length ? promo.services.map((s) => s.name).join(", ") : promo.title],
                    ["Branch", branch.name],
                    ["Professional", promoNeedsTeam ? "Assigned by the front desk" : professionalLabel],
                    ["Date", selectedDate ? formatDate(selectedDate) : "—"],
                    ["Time", selectedTime ? `${selectedTime} – ${endTime(selectedTime, `${totalDuration} mins`)}` : "—"],
                    ["Estimated Duration", formatMinutes(totalDuration)],
                    ...(promoRegular != null && promoRegular > total ? [["Regular Price", `₱${promoRegular.toLocaleString()}.00`], ["You Save", `₱${(promoRegular - total).toLocaleString()}.00`]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 px-4 py-2.5">
                      <dt className="shrink-0 text-ink/50">{k}</dt>
                      <dd className={`text-right font-medium ${k === "You Save" ? "text-[#2e7d32]" : "text-ink"}`}>{v}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 px-4 py-3">
                    <dt className="shrink-0 font-semibold text-ink">Promo Price</dt>
                    <dd className="text-right text-lg font-bold text-coral-dark">₱{total.toLocaleString()}.00</dd>
                  </div>
                </dl>
              ) : (
              <div className="rounded-xl border border-ink/10 p-4">
                <p className="text-base font-semibold text-ink">{serviceNames} with {professionalLabel}</p>
                <p className="mt-1 text-base text-ink/60">
                  {selectedDate ? formatDate(selectedDate) : "Select a date"} &bull;{" "}
                  {selectedTime
                    ? `${selectedTime} - ${endTime(selectedTime, `${totalDuration} mins`)}`
                    : "Select a time"}
                </p>
                <p className="mt-2 text-lg font-semibold text-gold">₱{subtotal.toLocaleString()}.00</p>
              </div>
              )}
              {appointmentType === "group" && (
                <p className="text-sm text-ink/50">
                  Spa Party Packages require full payment to confirm the slot.
                </p>
              )}
              <div>
                <label className="text-sm font-medium uppercase text-ink/40">
                  Contact Number <span className="text-red-500">*</span>
                </label>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/15 px-3 py-2.5 transition-colors focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/20">
                  <span className="text-base text-ink/50">+63</span>
                  <input
                    value={formatPhoneInput(contactPhone)}
                    onChange={(e) =>
                      setContactPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder="9XX XXX XXXX"
                    className="w-full text-base outline-none"
                  />
                </div>
                <p className="mt-1 text-sm text-ink/40">
                  So the branch can reach you about this appointment.
                </p>
              </div>
            </div>
          )}

          {step === "payment-choice" && (
            <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-ink">Choose payment option</p>
              <button
                onClick={() => setStep("confirm")}
                className="text-base font-medium text-ink/50 hover:text-ink"
              >
                ← Back
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => !payNowDisabled && !payNowOff && branchGcash && setStep("checkout")}
                disabled={payNowDisabled || payNowOff || !branchGcash}
                className="rounded-2xl border border-ink/10 p-6 text-left hover:border-coral disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink/10"
              >
                <p className="font-semibold text-ink">Pay Now</p>
                <p className="mt-1 text-sm text-ink/60">
                  Pay your required advance payment through GCash to secure your appointment.
                </p>
                {payNowOff ? (
                  <p className="mt-2 text-xs font-medium text-red-600">
                    Pay Now isn&apos;t available at this branch yet. Choose Pay Later instead.
                  </p>
                ) : payNowDisabled ? (
                  <p className="mt-2 text-xs font-medium text-red-600">
                    Not available right now — the branch is currently closed. Choose Pay Later instead.
                  </p>
                ) : !branchGcash ? (
                  <p className="mt-2 text-xs text-ink/40">Loading payment details…</p>
                ) : null}
              </button>
              <button
                onClick={async () => {
                  const ok = await saveBooking();
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
            </div>
          )}
          {step === "payment-choice" && saveError && (
            <p className="mt-3 text-sm text-red-600">{saveError}</p>
          )}

          {step === "checkout" && (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Pay via GCash</h2>
                  <p className="text-sm text-ink/60">Pay the amount below, then upload your GCash receipt.</p>
                </div>
                <button
                  onClick={() => setStep(appointmentType === "group" ? "confirm" : "payment-choice")}
                  className="text-base font-medium text-ink/50 hover:text-ink"
                >
                  ← Back
                </button>
              </div>

              {payNowOff && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Pay Now isn&apos;t available at this branch yet. Please call the branch to arrange your booking.
                </p>
              )}

              <div className="rounded-xl border border-coral bg-blush p-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase text-ink/40">GCash Account Name</dt>
                      <dd className="font-semibold text-ink">{branchGcash?.accountName || "Blush Spa & Aesthetics"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase text-ink/40">GCash Number</dt>
                      <dd className="font-mono text-lg font-semibold text-ink">
                        {branchGcash?.number ? formatGcashNumber(branchGcash.number) : branchGcash ? "Scan the QR code" : "Loading…"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase text-ink/40">Amount to Pay</dt>
                      <dd className="text-2xl font-bold text-coral-dark">{pesoAmount(total)}</dd>
                    </div>
                  </dl>
                  {branchGcash?.qrUrl && (
                    <div className="mx-auto flex flex-col items-center rounded-lg border border-ink/10 bg-white p-3">
                      {/* Admin-uploaded QR from Supabase Storage; a plain img keeps it full quality for scanning. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={branchGcash.qrUrl} alt="GCash QR code" className="h-48 w-48 object-contain" />
                      <p className="mt-1 text-xs text-ink/50">Scan with your GCash app</p>
                    </div>
                  )}
                </div>
                <p className="mt-4 rounded-lg bg-white/70 p-3 text-sm text-ink/70">
                  Send the <span className="font-semibold text-ink">exact amount</span> to the GCash account above, then upload
                  your GCash receipt below.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-ink">
                  Upload GCash Receipt <span className="text-red-500">*</span>
                </p>
                <p className="text-xs text-ink/50">Upload a screenshot or photo of your GCash payment receipt (JPG, PNG or WebP).</p>
                {receiptPreview ? (
                  <div className="mt-2 flex items-start gap-3 rounded-xl border border-ink/10 p-3">
                    {/* Local preview (blob URL) of the chosen receipt. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptPreview} alt="Your GCash receipt" className="h-32 w-24 rounded-lg border border-ink/10 object-cover" />
                    <div className="flex-1 text-sm">
                      <p className="flex items-center gap-1 font-medium text-green-700">
                        <Check className="h-4 w-4" /> Receipt added
                      </p>
                      <p className="truncate text-xs text-ink/50">{receiptFile?.name}</p>
                      <label className="mt-2 inline-block cursor-pointer rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-coral">
                        Change Receipt
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            chooseReceipt(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink/15 p-6 text-center hover:border-coral">
                    <Upload className="h-6 w-6 text-coral-dark" />
                    <span className="text-sm font-semibold text-ink">Upload Receipt</span>
                    <span className="text-xs text-ink/40">Tap to choose an image</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        chooseReceipt(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                {receiptError && <p className="mt-2 text-sm text-red-600">{receiptError}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-ink/60">
                  GCash Reference No. <span className="text-ink/40">(optional)</span>
                  <input
                    value={gcashReference}
                    onChange={(e) => setGcashReference(e.target.value.slice(0, 40))}
                    placeholder="e.g. 9021 882 731 12"
                    className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink outline-none focus:border-coral"
                  />
                </label>
                <label className="text-xs font-medium text-ink/60">
                  Sender Name <span className="text-ink/40">(optional)</span>
                  <input
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value.slice(0, 80))}
                    placeholder="Name on your GCash"
                    className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink outline-none focus:border-coral"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-ink/10 p-4 text-sm">
                <p className="font-medium text-ink">{serviceNames} with {professionalLabel}</p>
                <p className="mt-1 text-ink/60">
                  {selectedDate ? formatDate(selectedDate) : ""} &bull;{" "}
                  {selectedTime ? `${selectedTime} - ${endTime(selectedTime, `${totalDuration} mins`)}` : ""}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-ink/10 pt-3 font-semibold text-ink">
                  <span>Total</span>
                  <span>{pesoAmount(total)}</span>
                </div>
              </div>

              <p className="text-xs text-ink/50">
                Your booking stays <span className="font-semibold">Pending</span> until the Front Desk checks the payment in
                the spa&apos;s GCash account and confirms your appointment.
              </p>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            </div>
          )}

          {step === "success" && (
            <div className="space-y-4 py-4">
              {savedBooking?.payNow ? (
                <div className="space-y-2 text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Hourglass className="h-7 w-7" />
                  </span>
                  <h2 className="text-xl font-semibold text-ink">Booking Submitted</h2>
                  <p className="text-sm font-medium text-amber-700">🟡 Pending Verification</p>
                  <p className="text-sm text-ink/60">
                    Your GCash payment receipt has been submitted. Please wait while the Front Desk verifies your payment
                    and confirms your appointment.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Hourglass className="h-7 w-7" />
                  </span>
                  <h2 className="text-xl font-semibold text-ink">Booking request sent</h2>
                  <p className="text-sm font-medium text-amber-700">Waiting for confirmation</p>
                </div>
              )}

              <dl className="divide-y divide-ink/5 rounded-2xl border border-ink/10 text-sm">
                <div className="flex justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                  <dt className="shrink-0 text-ink/50">Services</dt>
                  <dd className="text-right font-medium text-ink">{serviceNames}</dd>
                </div>
                <div className="flex justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                  <dt className="shrink-0 text-ink/50">Branch</dt>
                  <dd className="text-right font-medium text-ink">{branch.name}</dd>
                </div>
                <div className="flex justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                  <dt className="shrink-0 text-ink/50">Therapist</dt>
                  <dd className="text-right font-medium capitalize text-ink">{professionalLabel}</dd>
                </div>
                <div className="flex justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                  <dt className="shrink-0 text-ink/50">Date &amp; time</dt>
                  <dd className="text-right font-medium text-ink">
                    {selectedDate ? formatDate(selectedDate) : ""}
                    {selectedTime && <>, {selectedTime} – {endTime(selectedTime, `${totalDuration} mins`)}</>}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                  <dt className="shrink-0 text-ink/50">Total</dt>
                  <dd className="text-right font-semibold text-ink">₱{total.toLocaleString()}.00</dd>
                </div>
                <div className="flex justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                  <dt className="shrink-0 text-ink/50">Payment</dt>
                  <dd className="text-right font-medium text-ink">
                    {savedBooking?.payNow
                      ? "GCash — Payment Submitted (waiting for verification)"
                      : "Pay at the branch on your appointment date"}
                  </dd>
                </div>
                {savedBooking?.code && (
                  <div className="flex justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                    <dt className="shrink-0 text-ink/50">Reference</dt>
                    <dd className="text-right font-mono font-medium text-ink">{savedBooking.code}</dd>
                  </div>
                )}
              </dl>

              {!savedBooking?.payNow && (
                <p className="text-center text-sm text-ink/60">
                  Our front desk will confirm your booking shortly. We&apos;ll notify you here as soon as it&apos;s
                  confirmed or if anything changes.
                </p>
              )}
            </div>
          )}
        </div>

        {showSelectedPanel && (step === "services" || step === "professional" || step === "time") && selectedServices.length > 0 && (
          <div className="border-t border-ink/10 bg-white px-4 py-3 sm:px-6 sm:py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold text-ink">Selected Services</p>
              <button
                onClick={() => { setSelectedServices([]); setShowSelectedPanel(false); }}
                className="rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink/60 hover:border-coral hover:text-coral-dark"
              >
                Unselect All
              </button>
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto sm:max-h-64">
              {selectedServices.map((s) => (
                <div key={s.id ?? s.name} className="flex items-center justify-between rounded-lg bg-blush px-3 py-2">
                  <div>
                    <p className="text-base font-medium text-ink">{s.name}</p>
                    {s.category && (
                      <p className="text-sm text-ink/50">{s.category}</p>
                    )}
                    <p className="text-sm text-gold font-semibold">₱{(s.price ?? 0).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => setSelectedServices((prev) => prev.filter((x) => (x.id ?? x.name) !== (s.id ?? s.name)))}
                    className="ml-3 rounded-full p-1 text-ink/40 hover:bg-ink/10 hover:text-coral"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <div className="text-sm text-ink/60">
            {(step === "services" || step === "professional" || step === "time") && selectedServices.length > 0 ? (
              <button
                onClick={() => setShowSelectedPanel((v) => !v)}
                className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-sm hover:border-coral hover:text-coral-dark transition"
              >
                <span className="font-semibold text-coral">{selectedServices.length} service{selectedServices.length > 1 ? "s" : ""}</span>
                <span className="text-ink/50">&bull; Total</span>
                <span className="font-semibold text-gold">₱{subtotal.toLocaleString()}.00</span>
                <ChevronRight className={`h-3.5 w-3.5 text-ink/40 transition-transform ${showSelectedPanel ? "-rotate-90" : "rotate-90"}`} />
              </button>
            ) : null}
          </div>

          {step === "type" && null}

          {step === "promo" && promo && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm font-semibold text-coral-dark">
                {promoPrice != null && (!promoSizes.length || promoLength) ? `₱${promoPrice.toLocaleString()}.00` : ""}
              </span>
              <button
                disabled={promoSizes.length > 0 && !promoLength}
                onClick={() => setStep("branch")}
                className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {step === "branch" && (
            <button
              disabled={!branchId}
              onClick={() => {
                if (!promo) return setStep("services");
                // The services come with the promo — straight to the professional.
                if (promoNeedsTeam) setProfessionalId("any");
                setStep("professional");
              }}
              className="ml-auto rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continue
            </button>
          )}

          {step === "services" && (
            <button
              disabled={selectedServices.length === 0}
              onClick={() => {
                if (appointmentType === "group") {
                  setProfessionalId("any");
                  setStep("time");
                } else {
                  setStep("professional");
                }
              }}
              className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-40"
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
              disabled={!selectedDay || !selectedTime || selectedTimePassed}
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
              disabled={!receiptFile || saving || !branchGcash?.payNowEnabled}
              onClick={submitPayNow}
              title={!receiptFile ? "Upload your GCash receipt first" : undefined}
              className="ml-auto rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Submitting..." : "Submit Booking"}
            </button>
          )}

          {step === "success" && (
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <Link
                href="/my-glow#my-bookings"
                onClick={close}
                className="flex-1 rounded-full border border-ink/15 px-5 py-2.5 text-center text-sm font-semibold text-ink/70 hover:border-coral hover:text-coral-dark sm:flex-none"
              >
                View my bookings
              </Link>
              <button
                onClick={close}
                className="flex-1 rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark sm:flex-none"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      {profileMember && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" onClick={() => setProfileMember(null)}>
          <div
            className="flex max-h-[calc(100vh-3rem)] w-full max-w-md flex-col rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-ink">Staff Profile</h3>
              <button onClick={() => setProfileMember(null)} className="text-ink/40 hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-3">
              {profileMember.avatar_url ? (
                <>
                  <button
                    onClick={() => setZoomedAvatar(profileMember.avatar_url)}
                    className="relative flex h-20 w-20 shrink-0 rounded-full overflow-hidden ring-2 ring-coral/30 hover:ring-coral transition-all cursor-zoom-in"
                  >
                    <Image src={profileMember.avatar_url} alt={profileMember.full_name} fill className="object-cover" />
                  </button>
                  {zoomedAvatar && (
                    <div
                      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 cursor-zoom-out"
                      onClick={() => setZoomedAvatar(null)}
                    >
                      <div className="relative h-72 w-72 rounded-full overflow-hidden shadow-2xl">
                        <Image src={zoomedAvatar} alt="zoomed" fill className="object-cover" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-blush text-2xl font-bold text-coral-dark overflow-hidden">
                  {profileMember.full_name.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="text-center">
                <p className="text-lg font-semibold text-ink">{profileMember.full_name}</p>
                <p className="text-sm text-coral-dark font-medium">{profileMember.department}</p>
              </div>
              {profileMember.phone && (
                <div className="flex items-center gap-2 text-sm text-ink/60">
                  <Phone className="h-4 w-4" />
                  {profileMember.phone}
                </div>
              )}
            </div>
            <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1">
              <StaffProfileDetails
                staffId={profileMember.id}
                fullName={profileMember.full_name}
                department={profileMember.department}
                branchName={branchContacts.find((b) => b.id === branchId)?.name ?? null}
                categories={Array.from(
                  dbServices
                    .filter((s) => s.department === profileMember.department)
                    .reduce((m, s) => m.set(s.category, (m.get(s.category) ?? 0) + 1), new Map<string, number>())
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([c]) => c)}
              />
            </div>
            <button
              onClick={() => {
                setProfessionalId(profileMember.id);
                setProfileMember(null);
              }}
              className="mt-4 w-full shrink-0 rounded-full bg-coral py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              Select {profileMember.full_name}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
