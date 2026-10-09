// GlowSync Guide (Services page): what the mascot says about each card and
// its quick answers. Built only from real service and promo data — nothing
// invented. Pure so it can be tested.

export type GuideService = {
  id: string;
  name: string;
  category: string;
  duration: string | null;
  price: number;
  price_41?: number | null;
  description: string | null;
  benefits?: string | null;
  hairPrices?: { short: number; medium: number; long: number } | null;
};

export type GuidePromo = { id: string; title: string; price: number | null; validUntil: string | null; category: string | null };

export type GuideRating = { average: number; count: number } | null;

export type GuideMood = "point" | "relax" | "cheek" | "hands" | "excited";

export type GuideFacts = {
  id: string;
  kind: "category" | "service";
  title: string;
  category: string;
  reaction: string;
  /** Short catchy headline for the bubble, e.g. "Want a fresh new look?" */
  hook: string;
  /** The mascot's gesture for this kind of treatment. */
  mood: GuideMood;
  intro: string;
  why: string;
  meta: string[];
  promo: GuidePromo | null;
  answers: { price: string; duration: string; benefits: string; promotions: string; compare: string };
};

// A little reaction per kind of treatment (shown above the mascot).
const REACTIONS: [RegExp, string][] = [
  [/facial|skin|glow/i, "✨"],
  [/hair|rebond|color|keratin|brazilian/i, "💇‍♀️"],
  [/nail|mani|pedi/i, "💅"],
  [/brow|lash/i, "👁️"],
  [/massage|body|wellness|spa|wax/i, "😌"],
  [/laser/i, "⚡"],
  [/slim|lipo|hifu|contour/i, "💪"],
  [/drip|iv|cocktail/i, "💧"],
  [/doctor|botox|filler|thread|prp/i, "🩺"],
  [/premium|signature/i, "👑"],
];

export function reactionFor(text: string): string {
  return REACTIONS.find(([re]) => re.test(text))?.[1] ?? "✨";
}

// The bubble's headline per kind of treatment.
const HOOKS: [RegExp, string][] = [
  [/hair|rebond|color|keratin|brazilian/i, "Want a fresh new look?"],
  [/nail|mani|pedi/i, "Pamper your hands & feet?"],
  [/brow|lash/i, "Frame your face beautifully?"],
  [/massage|body|wellness|spa/i, "Need time to unwind?"],
  [/wax/i, "Smooth and confident?"],
  [/laser/i, "Clearer, smoother skin?"],
  [/slim|lipo|hifu|contour/i, "Ready to contour?"],
  [/drip|iv|cocktail/i, "Glow from within?"],
  [/doctor|botox|filler|thread|prp/i, "Expert results you can trust?"],
  [/premium|signature/i, "Treat yourself to luxury?"],
  [/facial|skin|glow|acne/i, "Ready to glow?"],
];

export function hookFor(text: string): string {
  return HOOKS.find(([re]) => re.test(text))?.[1] ?? "Looking for something special?";
}

// Facials: touches its cheek. Hair and makeovers: excited. Nails: shows its
// hands. Massage: relaxed. Everything else: points at the card.
const MOODS: [RegExp, GuideMood][] = [
  [/massage|wellness|relax|ear candling/i, "relax"],
  [/nail|mani|pedi|hand spa|foot spa/i, "hands"],
  [/hair|rebond|color|keratin|brazilian smoothing|make-?up|lashes|brows/i, "excited"],
  [/facial|skin|glow|peel|acne|melasma/i, "cheek"],
];

export function moodFor(text: string): GuideMood {
  return MOODS.find(([re]) => re.test(text))?.[1] ?? "point";
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

/** First sentence (or ~140 characters) of a description. */
export function firstSentence(text: string | null | undefined, max = 140): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const end = t.search(/[.!?](\s|$)/);
  const s = end > 0 ? t.slice(0, end + 1) : t;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function priceLabel(s: GuideService): string {
  if (s.hairPrices) {
    const parts = (["short", "medium", "long"] as const).filter((k) => s.hairPrices![k] > 0).map((k) => `${k[0].toUpperCase()}${k.slice(1)} ${peso(s.hairPrices![k])}`);
    if (parts.length) return parts.join(" · ");
  }
  return s.price > 0 ? peso(s.price) : "Price on consultation";
}

function lowest(s: GuideService): number {
  const hair = s.hairPrices ? Object.values(s.hairPrices).filter((v) => v > 0) : [];
  return hair.length ? Math.min(...hair) : s.price;
}

/** An active promo for this service (named in the title), else one for its category. */
export function promoFor(service: Pick<GuideService, "name" | "category">, promos: GuidePromo[]): GuidePromo | null {
  const name = norm(service.name);
  const inCategory = promos.filter((p) => norm(p.category) === norm(service.category));
  return inCategory.find((p) => name && norm(p.title).includes(name)) ?? null;
}

function promoLine(p: GuidePromo | null): string {
  if (!p) return "";
  const until = p.validUntil
    ? ` until ${new Date(`${p.validUntil}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "";
  return `🎁 On promo now: ${p.title}${p.price ? ` for ${peso(p.price)}` : ""}${until}!`;
}

export function serviceFacts(s: GuideService, siblings: GuideService[], promos: GuidePromo[], rating: GuideRating, categoryBlurb: string): GuideFacts {
  const promo = promoFor(s, promos);
  const about = firstSentence(s.description) || firstSentence(s.benefits) || firstSentence(categoryBlurb);
  const why = firstSentence(s.benefits && s.benefits !== s.description ? s.benefits : "") || `A favorite in our ${s.category} menu.`;
  const meta = [priceLabel(s), s.duration ?? "", rating ? `★ ${rating.average.toFixed(1)} (${rating.count})` : ""].filter(Boolean);

  const others = siblings.filter((o) => o.id !== s.id && lowest(o) > 0);
  const cheaper = others.filter((o) => lowest(o) < lowest(s)).sort((a, b) => lowest(a) - lowest(b))[0];
  const compare = others.length
    ? cheaper
      ? `${s.name} is ${priceLabel(s)}. If you'd like something lighter on the budget, ${cheaper.name} is ${priceLabel(cheaper)}.`
      : `${s.name} is one of the most affordable picks in ${s.category} (${priceLabel(s)}).`
    : `${s.name} is our ${s.category} treatment — ${priceLabel(s)}.`;

  return {
    id: s.id,
    kind: "service",
    title: s.name,
    category: s.category,
    reaction: reactionFor(`${s.category} ${s.name}`),
    hook: hookFor(`${s.name} ${s.category}`),
    mood: moodFor(`${s.name} ${s.category}`),
    intro: `Let me introduce ${s.name}! ${about}`.trim(),
    why,
    meta,
    promo,
    answers: {
      price: `${s.name}: ${priceLabel(s)}${s.price_41 ? ` · Package ${peso(s.price_41)}` : ""}.`,
      duration: s.duration ? `${s.name} takes about ${s.duration}.` : "I don't have the duration for this one — check the service details.",
      benefits: firstSentence(s.benefits, 220) || firstSentence(s.description, 220) || "I don't have more details on this one yet — tap View Details.",
      promotions: promoLine(promo) || "No promo on this one right now — check Active Promotions on our home page.",
      compare,
    },
  };
}

export function categoryFacts(category: string, services: GuideService[], promos: GuidePromo[], rating: GuideRating, blurb: string): GuideFacts {
  const prices = services.map(lowest).filter((p) => p > 0);
  const range = prices.length ? (Math.min(...prices) === Math.max(...prices) ? peso(prices[0]) : `${peso(Math.min(...prices))} – ${peso(Math.max(...prices))}`) : "";
  const promo = promos.find((p) => norm(p.category) === norm(category)) ?? null;
  const n = services.length;
  return {
    id: `category:${category}`,
    kind: "category",
    title: category,
    category,
    reaction: reactionFor(category),
    hook: hookFor(category),
    mood: moodFor(category),
    intro: `Let me introduce ${category}! ${firstSentence(blurb)}`.trim(),
    why: `${n} treatment${n !== 1 ? "s" : ""} to choose from${range ? `, from ${range}` : ""}.`,
    meta: [`${n} treatment${n !== 1 ? "s" : ""}`, range, rating ? `★ ${rating.average.toFixed(1)}` : ""].filter(Boolean),
    promo,
    answers: {
      price: range ? `${category} ranges ${range}.` : "Prices are listed inside this category.",
      duration: "Each treatment shows its time inside — most take 30 to 90 minutes.",
      benefits: firstSentence(blurb, 220) || `Professional ${category.toLowerCase()} at Blush Spa & Aesthetics.`,
      promotions: promoLine(promo) || "No promo in this category right now — check Active Promotions on our home page.",
      compare: n > 1 ? `There are ${n} ${category} treatments${range ? ` (${range})` : ""} — open the category to compare them side by side.` : `This category has one treatment${range ? ` (${range})` : ""}.`,
    },
  };
}
