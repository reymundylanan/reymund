// "What can I do here?" — GlowSync AI's help for each client page. Shown in
// the chat when a client asks for help, and sent to the AI so it knows which
// page the client is looking at. Pure so it can be tested.

export type PageTip = { label: string; detail: string };
export type PageHelp = { page: string; summary: string; tips: PageTip[] };

const BOOKING_TIP: PageTip = {
  label: "Book Now",
  detail: "Opens booking with that service already in Selected Services — then pick a branch, a professional (or Any) and a time.",
};

const PAGES: { match: (p: string) => boolean; help: PageHelp }[] = [
  {
    match: (p) => p === "/",
    help: {
      page: "Home",
      summary: "The front door of Blush Spa & Aesthetics: promos, our services, the team and client reviews.",
      tips: [
        { label: "Active Promotions", detail: "Today's deals. Tap Book Promo to book the whole package at its promo price." },
        { label: "Meet the Team", detail: "Tap any team member and I'll introduce them — then you can book with them." },
        { label: "Reviews", detail: "Real reviews from clients after their visits." },
        { label: "Login", detail: "Sign in with Google or Facebook to book, earn GlowPoints and track your visits." },
      ],
    },
  },
  {
    match: (p) => p === "/services",
    help: {
      page: "Services",
      summary: "Our full menu: pick a category to see every treatment with its price, time and reviews.",
      tips: [
        { label: "Categories", detail: "Tap a category (Facial, Hair, Nails…) to see its treatments. Use the search box to find one fast." },
        BOOKING_TIP,
        { label: "View Details", detail: "The full description, benefits and every review for that treatment." },
        { label: "Me on the cards", detail: "I introduce each service as you move your mouse. Tap Ask me to ask about one." },
      ],
    },
  },
  {
    match: (p) => p.startsWith("/services/"),
    help: {
      page: "Service details",
      summary: "Everything about one treatment: what it is, its benefits, price, time and client reviews.",
      tips: [BOOKING_TIP, { label: "Reviews", detail: "Read what clients said after this treatment." }],
    },
  },
  {
    match: (p) => p.startsWith("/branches"),
    help: {
      page: "Branches",
      summary: "Our branches in Pagadian City with their address, hours, phone and map.",
      tips: [
        { label: "Pick a branch", detail: "See its hours, contact number and location on the map." },
        { label: "Book here", detail: "Booking from a branch page skips choosing the branch." },
      ],
    },
  },
  {
    match: (p) => p.startsWith("/team/"),
    help: {
      page: "Team member profile",
      summary: "One of our professionals: their department, branch, rating and reviews from clients.",
      tips: [
        { label: "Rating breakdown", detail: "How clients rated their visits with this professional." },
        { label: "Booking", detail: "When booking, choose this professional at the Choose a professional step." },
      ],
    },
  },
  {
    match: (p) => p.startsWith("/promos/"),
    help: {
      page: "Promo",
      summary: "The details of one promotion: what's included, the promo price, branch and how long it runs.",
      tips: [{ label: "Book Promo", detail: "Books every service in the package at the promo price." }],
    },
  },
  {
    match: (p) => p === "/my-glow",
    help: {
      page: "My Glow",
      summary: "Your personal space: bookings, services you've had, rewards, reviews and notifications.",
      tips: [
        { label: "My Bookings", detail: "Your upcoming and past appointments and their payment status. Tap one for its timeline." },
        { label: "My Rewards", detail: "Your GlowPoints and tier. Redeem points for vouchers — the Front Desk applies them when you pay." },
        { label: "Reviews", detail: "Review completed visits to earn GlowPoints." },
        { label: "Notifications", detail: "Turn email reminders on or off, and connect Messenger for reminders there." },
      ],
    },
  },
  {
    match: (p) => p.startsWith("/my-glow/appointments/"),
    help: {
      page: "Appointment details",
      summary: "One booking: its status timeline, services, professional, payment and branch.",
      tips: [
        { label: "Timeline", detail: "Shows when it was booked, confirmed, checked in and completed." },
        { label: "Changes", detail: "To reschedule or cancel, call or message your branch — paid bookings carry over to the new date." },
      ],
    },
  },
  {
    match: (p) => p.startsWith("/my-glow/journey"),
    help: {
      page: "Glow Journey",
      summary: "Your history of completed visits and the reviews you've shared.",
      tips: [{ label: "Review a visit", detail: "Visits without a review can still be reviewed to earn GlowPoints." }],
    },
  },
  {
    match: (p) => p.startsWith("/my-glow/profile"),
    help: {
      page: "Profile",
      summary: "Your name, phone, photo and other details used for your bookings.",
      tips: [{ label: "Save", detail: "Update your details and tap Save." }],
    },
  },
  {
    match: (p) => p.startsWith("/feedback"),
    help: {
      page: "Feedback",
      summary: "Send the spa a suggestion, compliment or concern.",
      tips: [{ label: "Submit", detail: "Write your message and send it to the spa." }],
    },
  },
  {
    match: (p) => p.startsWith("/faq"),
    help: {
      page: "FAQs",
      summary: "Answers to common questions about booking, payments, late arrivals and rewards.",
      tips: [{ label: "Still unsure?", detail: "Ask me anything here in the chat." }],
    },
  },
  {
    match: (p) => p.startsWith("/about"),
    help: {
      page: "About Us",
      summary: "The story of Blush Spa & Aesthetics, our leadership and what we stand for.",
      tips: [{ label: "Ready to visit?", detail: "Head to Services to pick a treatment and book." }],
    },
  },
];

const FALLBACK: PageHelp = {
  page: "this page",
  summary: "Part of the Blush Spa & Aesthetics website.",
  tips: [
    { label: "Services", detail: "See every treatment with prices and book in a few taps." },
    { label: "My Glow", detail: "Your bookings, rewards and reviews (after signing in)." },
  ],
};

export function pageHelpFor(pathname: string): PageHelp {
  const p = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return PAGES.find((x) => x.match(p))?.help ?? FALLBACK;
}

/** The chat reply when a client asks "What can I do here?". */
export function pageHelpMessage(pathname: string): string {
  const h = pageHelpFor(pathname);
  const tips = h.tips.map((t) => `• ${t.label} — ${t.detail}`).join("\n");
  return `You're on ${h.page === "this page" ? "this page" : `the ${h.page} page`} ✨ ${h.summary}\n\nHere's what you can do:\n${tips}\n\nAsk me if anything is unclear!`;
}

/** One line for the AI's instructions so it can explain the page the client is on. */
export function pageContextLine(pathname: string): string {
  const h = pageHelpFor(pathname);
  return `The customer is currently on the ${h.page} page (${h.summary}). On this page they can: ${h.tips.map((t) => `${t.label} (${t.detail})`).join("; ")}. If they ask what something on the page does, explain it from this.`;
}
