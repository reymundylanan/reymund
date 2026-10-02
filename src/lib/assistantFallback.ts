// Answers the client chat without AI when Gemini is out of quota or down:
// prices and services straight from the live catalog, plus a few common
// questions. Pure, so it can be unit-tested.

export type HairPrices = { short: number; medium: number; long: number };

export type FallbackService = {
  id: string;
  name: string;
  category: string;
  price: number;
  hairPrices: HairPrices | null;
};

export type FallbackContext = {
  firstName: string;
  upcoming: string | null;
  hours: string;
  branches: string[];
};

const peso = (n: number) => `₱${n.toLocaleString()}`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

/** "₱1,500" or "Short ₱1,000 · Medium ₱1,500 · Long ₱2,000". */
export function priceText(s: FallbackService): string {
  if (s.hairPrices) {
    const parts = (["short", "medium", "long"] as const)
      .filter((k) => s.hairPrices![k] > 0)
      .map((k) => `${k[0].toUpperCase()}${k.slice(1)} ${peso(s.hairPrices![k])}`);
    if (parts.length) return parts.join(" · ");
  }
  return s.price > 0 ? peso(s.price) : "price on consultation";
}

/** Services named in the message (whole name, or every word of it). */
export function findServices(message: string, services: FallbackService[]): FallbackService[] {
  const text = ` ${norm(message)} `;
  const seen = new Set<string>();
  const hits: FallbackService[] = [];
  for (const s of services) {
    const name = norm(s.name);
    if (!name || seen.has(name)) continue;
    const words = name.split(" ").filter((w) => w.length > 2);
    if (text.includes(` ${name} `) || (words.length > 0 && words.every((w) => text.includes(` ${w}`)))) {
      seen.add(name);
      hits.push(s);
    }
  }
  return hits.slice(0, 3);
}

function findCategory(message: string, services: FallbackService[]): FallbackService[] {
  const text = norm(message);
  const cats = [...new Set(services.map((s) => s.category))];
  const cat = cats.find((c) => norm(c).split(" ").some((w) => w.length > 3 && text.includes(w.replace(/s$/, ""))));
  if (!cat) return [];
  const seen = new Set<string>();
  return services.filter((s) => s.category === cat && !seen.has(s.name) && seen.add(s.name)).slice(0, 3);
}

export function fallbackReply(message: string, services: FallbackService[], ctx: FallbackContext): { reply: string; ids: string[] } {
  const text = norm(message);
  const named = findServices(message, services);
  if (named.length) {
    const lines = named.map((s) => `• ${s.name}: ${priceText(s)}`);
    return {
      reply: `Here are the current prices:\n${lines.join("\n")}\n\nTap "Book Now" to schedule. ✨`,
      ids: named.map((s) => s.id),
    };
  }

  if (/\b(booking|bookings|appointment|appointments|schedule|sched)\b/.test(text)) {
    return {
      reply: ctx.upcoming
        ? `Your next booking: ${ctx.upcoming}. You can see all your bookings in My Glow.`
        : `You don't have an upcoming booking yet, ${ctx.firstName}. Tap "Book Now" on any service to make one!`,
      ids: [],
    };
  }

  if (/\b(hour|hours|open|close|closing|time)\b/.test(text)) {
    return { reply: `We're open ${ctx.hours}, every day.`, ids: [] };
  }

  if (/\b(branch|branches|where|location|address)\b/.test(text)) {
    return { reply: `You can visit us at:\n${ctx.branches.map((b) => `• ${b}`).join("\n")}`, ids: [] };
  }

  if (/\b(promo|promos|promotion|promotions|discount|sale|deal|deals)\b/.test(text)) {
    return { reply: "Check out our Active Promotions on the home page — new deals are added often! 🎉", ids: [] };
  }

  const inCategory = findCategory(message, services);
  if (inCategory.length) {
    return {
      reply: `Here are some ${inCategory[0].category} options:\n${inCategory.map((s) => `• ${s.name}: ${priceText(s)}`).join("\n")}`,
      ids: inCategory.map((s) => s.id),
    };
  }

  if (/\b(recommend|suggest|best|popular)\b/.test(text)) {
    const picks = services.filter((s) => s.price > 0 || s.hairPrices).slice(0, 3);
    return {
      reply: "Here are a few client favorites to start with. Tell me which treatment type you're interested in and I'll narrow it down!",
      ids: picks.map((s) => s.id),
    };
  }

  return {
    reply:
      "I'm getting a lot of questions right now, so my smart answers are taking a short break. 💛 I can still tell you prices — just type a service name (like \"Brazilian\" or \"Facial\"), or ask about bookings, hours or branches.",
    ids: [],
  };
}
