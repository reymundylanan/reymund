export const fdStats = [
  { label: "Daily Appointments", value: "24", note: "+8% from yesterday" },
  { label: "Pending Payments", value: "₱14,250", note: "5 unverified" },
  { label: "Walk-in Queue", value: "5 Waiting", note: "Est. wait: 25 mins" },
  { label: "Staff On Duty", value: "8 / 12", note: "4 on break" },
];

export type ScheduleItem = {
  id: string;
  time: string;
  client: string;
  service: string;
  therapist: string;
  status: "Finished" | "In Service" | "Checked In" | "No-Show" | "No Booking";
};

export const todaySchedule: ScheduleItem[] = [
  { id: "s1", time: "09:00 AM", client: "Elena Richards", service: "Express Manicure", therapist: "Esthetician Joy", status: "Finished" },
  { id: "s2", time: "09:30 AM", client: "Maria Santos", service: "Signature HydraFacial", therapist: "Specialist Clara", status: "Checked In" },
  { id: "s3", time: "10:00 AM", client: "Sofia Vallez", service: "Gel Manicure", therapist: "Esthetician Joy", status: "In Service" },
  { id: "s4", time: "10:30 AM", client: "—", service: "—", therapist: "Therapist Anne", status: "No Booking" },
  { id: "s5", time: "11:00 AM", client: "Isabella Cruz", service: "Microblading Session", therapist: "Lead Aesthetician", status: "Checked In" },
];

export type QueueClient = {
  id: string;
  name: string;
  waitingMinutes: number;
  service: string;
};

export const lobbyQueue: QueueClient[] = [
  { id: "q1", name: "Theresa May", waitingMinutes: 12, service: "Foot Spa" },
  { id: "q2", name: "Miguel Cruz", waitingMinutes: 18, service: "Hair Cut" },
  { id: "q3", name: "Angela Sy", waitingMinutes: 25, service: "Head Massage" },
  { id: "q4", name: "John Doe", waitingMinutes: 35, service: "Deep Tissue Massage" },
  { id: "q5", name: "Sofia Gomez", waitingMinutes: 40, service: "Nail Art" },
];

export type Therapist = {
  id: string;
  name: string;
  role: string;
  status: "Active" | "On Break" | "Available";
};

export const therapistsOnDuty: Therapist[] = [
  { id: "t1", name: "Grace", role: "Senior Aesthetician", status: "Active" },
  { id: "t2", name: "Liza", role: "Massage Therapist", status: "Active" },
  { id: "t3", name: "Joy", role: "Nail Specialist", status: "On Break" },
  { id: "t4", name: "Theresa", role: "Esthetician", status: "Active" },
  { id: "t5", name: "Anne", role: "Massage Therapist", status: "Available" },
  { id: "t6", name: "Clara", role: "Lead Aesthetician", status: "Active" },
];

export type TimelineBlock = {
  title: string;
  start: number;
  duration: number;
  type: "normal" | "break" | "conflict";
};

export type TherapistTimeline = {
  id: string;
  therapist: string;
  blocks: TimelineBlock[];
};

export const appointmentTimeline: TherapistTimeline[] = [
  {
    id: "tl1",
    therapist: "Elena Rodriguez",
    blocks: [
      { title: "HydraFacial Deluxe", start: 9, duration: 1, type: "normal" },
      { title: "Lunch Break", start: 12, duration: 1, type: "break" },
    ],
  },
  {
    id: "tl2",
    therapist: "Sarah J.",
    blocks: [
      { title: "Double Booking: Elena R.", start: 10, duration: 1, type: "conflict" },
    ],
  },
  {
    id: "tl3",
    therapist: "Michael B.",
    blocks: [{ title: "Laser Therapy (Urgent)", start: 14, duration: 1, type: "conflict" }],
  },
  {
    id: "tl4",
    therapist: "Bianca Dela Cruz",
    blocks: [{ title: "Facial • Morning", start: 9.5, duration: 1.5, type: "normal" }],
  },
  {
    id: "tl5",
    therapist: "James Harrison",
    blocks: [{ title: "Regular Massage", start: 11, duration: 1, type: "normal" }],
  },
  {
    id: "tl6",
    therapist: "Sofia Vallez",
    blocks: [{ title: "Gel Manicure", start: 13, duration: 1, type: "normal" }],
  },
];

export const appointmentSummary = {
  conflicts: 1,
  staffActive: 6,
  staffTotal: 8,
  appointmentsToday: 12,
};

export type GCashTransaction = {
  id: string;
  reference: string;
  sender: string;
  amount: number;
  time: string;
  status: "unmatched" | "verified";
  suggestedClient?: string;
  suggestedBookingId?: string;
  suggestedTime?: string;
  matchConfidence?: number;
};

export const gcashFeed: GCashTransaction[] = [
  {
    id: "gc1",
    reference: "902188273112",
    sender: "Maria Clara",
    amount: 1500,
    time: "10:45 AM",
    status: "unmatched",
    suggestedClient: "Maria Clara de los Santos",
    suggestedBookingId: "BL-4491",
    suggestedTime: "11:00 AM",
    matchConfidence: 95,
  },
  {
    id: "gc2",
    reference: "902188273550",
    sender: "Jose Rizal",
    amount: 850,
    time: "11:02 AM",
    status: "unmatched",
    suggestedClient: "Jose P. Rizal",
    suggestedBookingId: "BL-4502",
    suggestedTime: "11:15 AM",
    matchConfidence: 88,
  },
  {
    id: "gc3",
    reference: "902188274001",
    sender: "Leonor Rivera",
    amount: 3200,
    time: "11:15 AM",
    status: "verified",
  },
  {
    id: "gc4",
    reference: "902188274210",
    sender: "Juan Luna",
    amount: 1200,
    time: "11:30 AM",
    status: "unmatched",
    suggestedClient: "Juan Luna",
    suggestedBookingId: "BL-4510",
    suggestedTime: "11:45 AM",
    matchConfidence: 91,
  },
  {
    id: "gc5",
    reference: "902188274559",
    sender: "Andres Bonifacio",
    amount: 500,
    time: "11:45 AM",
    status: "unmatched",
    suggestedClient: "Andres Bonifacio",
    suggestedBookingId: "BL-4521",
    suggestedTime: "12:00 PM",
    matchConfidence: 79,
  },
];

export const pendingRefund = {
  bookingId: "BL-9921",
  amount: 300,
  reason: "Booking #BL-9921 requires a ₱300.00 adjustment due to service downgrading.",
};

export const lastTransaction = {
  amount: 1500,
  reference: "902188273112",
};

export const securityChecklist = [
  "Verify sender name matches GCash SMS alert.",
  "Check Reference ID for duplicate entries.",
  "Confirm total amount inclusive of 10% VAT.",
];

export type ServiceHistoryItem = {
  date: string;
  service: string;
  therapist: string;
  price: string;
  status: string;
};

export type Client = {
  id: string;
  name: string;
  vip: boolean;
  phone: string;
  email: string;
  address: string;
  memberSince: string;
  totalSpend: string;
  loyaltyPoints: number;
  pointsToReward: number;
  visitsThisYear: number;
  lastVisit: string;
  allergy: string;
  preferences: string;
  gdprConsented: boolean;
  serviceHistory: ServiceHistoryItem[];
};

export const clients: Client[] = [
  {
    id: "c1",
    name: "Sophia Montgomery",
    vip: true,
    phone: "+63 917 123 4567",
    email: "sophia.m@gmail.com",
    address: "123 Orchid St., Hilltop Villas, Pagadian City",
    memberSince: "Jan 2022",
    totalSpend: "₱45,200",
    loyaltyPoints: 1250,
    pointsToReward: 750,
    visitsThisYear: 14,
    lastVisit: "Oct 12, 2023",
    allergy: "Lavender oil, Nuts",
    preferences: "Prefers lavender essential oils and medium pressure.",
    gdprConsented: true,
    serviceHistory: [
      { date: "Oct 12, 2023", service: "Signature Whitening Facial", therapist: "Specialist Clara", price: "₱2,500", status: "Completed" },
      { date: "Sep 20, 2023", service: "Full Body Massage (90m)", therapist: "Therapist Leo", price: "₱3,200", status: "Completed" },
      { date: "Aug 15, 2023", service: "Diamond Peel", therapist: "Specialist Clara", price: "₱1,800", status: "Completed" },
    ],
  },
  {
    id: "c2",
    name: "Marcus Chen",
    vip: false,
    phone: "+63 908 444 8888",
    email: "marcus.chen@gmail.com",
    address: "45 Rizal Ave, Pagadian City",
    memberSince: "Mar 2023",
    totalSpend: "₱12,400",
    loyaltyPoints: 320,
    pointsToReward: 180,
    visitsThisYear: 5,
    lastVisit: "Sep 28, 2023",
    allergy: "None recorded",
    preferences: "Prefers firm pressure massage.",
    gdprConsented: true,
    serviceHistory: [
      { date: "Sep 28, 2023", service: "Deep Tissue Massage", therapist: "Therapist Ben", price: "₱1,500", status: "Completed" },
    ],
  },
  {
    id: "c3",
    name: "Isabella Rivera",
    vip: true,
    phone: "+63 915 222 3333",
    email: "isabella.rivera@gmail.com",
    address: "9 Magsaysay St, Pagadian City",
    memberSince: "Jun 2021",
    totalSpend: "₱62,800",
    loyaltyPoints: 1980,
    pointsToReward: 20,
    visitsThisYear: 22,
    lastVisit: "Oct 18, 2023",
    allergy: "Nuts",
    preferences: "VIP guest — always offer welcome tea.",
    gdprConsented: true,
    serviceHistory: [
      { date: "Oct 18, 2023", service: "Signature HydraFacial", therapist: "Specialist Clara", price: "₱2,200", status: "Completed" },
      { date: "Oct 02, 2023", service: "Microblading Session", therapist: "Lead Aesthetician", price: "₱4,500", status: "Completed" },
    ],
  },
];

export const staffCapacityStats = [
  { label: "Staff Capacity", value: "85%" },
  { label: "Occupancy", value: "82%" },
  { label: "Rooms In Use", value: "6 / 8" },
  { label: "Staff On Duty", value: "12" },
];

export type ShiftBlock = {
  title: string;
  start: number;
  duration: number;
  type: "working" | "break" | "off";
};

export type StaffShiftRow = {
  id: string;
  name: string;
  blocks: ShiftBlock[];
};

export const staffShifts: StaffShiftRow[] = [
  {
    id: "ss1",
    name: "Grace",
    blocks: [
      { title: "On Shift", start: 9, duration: 3, type: "working" },
      { title: "Break", start: 12, duration: 1, type: "break" },
      { title: "On Shift", start: 13, duration: 4, type: "working" },
    ],
  },
  {
    id: "ss2",
    name: "Liza",
    blocks: [{ title: "On Shift", start: 9.5, duration: 8, type: "working" }],
  },
  {
    id: "ss3",
    name: "Joy",
    blocks: [
      { title: "On Shift", start: 9, duration: 2.5, type: "working" },
      { title: "Break", start: 11.5, duration: 1, type: "break" },
      { title: "On Shift", start: 12.5, duration: 4.5, type: "working" },
    ],
  },
  {
    id: "ss4",
    name: "Theresa",
    blocks: [{ title: "On Shift", start: 10, duration: 7, type: "working" }],
  },
  {
    id: "ss5",
    name: "Anne",
    blocks: [{ title: "Off Today", start: 9, duration: 11.5, type: "off" }],
  },
  {
    id: "ss6",
    name: "Clara",
    blocks: [{ title: "On Shift", start: 9, duration: 9, type: "working" }],
  },
];

export const dashboardAlerts = [
  {
    id: "al1",
    title: "No-Show Alert",
    detail: "Client Kevin Chen (10:30 AM) failed to arrive. 15min grace period exceeded.",
  },
  {
    id: "al2",
    title: "Inventory Low",
    detail: "Essential Oils (Lavender) and Face Wraps are below 20% stock levels.",
  },
];
