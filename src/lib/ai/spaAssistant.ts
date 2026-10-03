import type { SupabaseClient } from "@supabase/supabase-js";
import { branchContacts } from "@/lib/data";
import { GeminiError, geminiGenerate } from "@/lib/ai/gemini";
import { fallbackReply, priceText, type HairPrices } from "@/lib/assistantFallback";

// GlowSync AI: the spa assistant shared by the website chat
// (/api/assistant) and the Facebook Page chatbot (Messenger webhook).

export type LiveService = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string | null;
  price: number;
  description: string | null;
  branchId: string;
  branchName: string;
  hairPrices: HairPrices | null;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type AssistantChannel = "web" | "messenger";

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Live, active-only service catalog — a service added/edited/deactivated
 * in Branches & Services shows up (or disappears) immediately. */
export async function loadLiveServices(supabase: SupabaseClient): Promise<LiveService[]> {
  const { data, error } = await supabase
    .from("branch_services")
    .select("id, name, category, department, duration, price, description, branch_id, status, hair_options, branch:branches(name)")
    .eq("status", "Active")
    .order("category")
    .order("name");

  if (error) {
    console.error("assistant: loadLiveServices failed:", error);
    return [];
  }

  type Row = {
    id: string;
    name: string;
    category: string;
    department: string;
    duration: string | null;
    price: number;
    description: string | null;
    branch_id: string;
    hair_options: { prices?: Partial<Record<keyof HairPrices, string | number>> } | null;
    branch: Rel<{ name: string }>;
  };

  const num = (v: string | number | undefined) => {
    const n = Number(String(v ?? "").replace(/[₱,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    department: row.department,
    duration: row.duration,
    price: row.price,
    description: row.description,
    branchId: row.branch_id,
    branchName: one(row.branch)?.name ?? "Blush Spa",
    // Hair services are priced by length (Short / Medium / Long).
    hairPrices: row.hair_options?.prices
      ? { short: num(row.hair_options.prices.short), medium: num(row.hair_options.prices.medium), long: num(row.hair_options.prices.long) }
      : null,
  }));
}

/** Hair: the lowest length price, so a card never shows ₱0. */
export function lowestPrice(s: LiveService) {
  const sizes = s.hairPrices ? Object.values(s.hairPrices).filter((v) => v > 0) : [];
  return sizes.length ? Math.min(...sizes) : s.price;
}

function buildSystemPrompt(userContext: string, services: LiveService[], preferredBranchName: string | null, channel: AssistantChannel) {
  const branches = branchContacts
    .map((b) => `- ${b.name} (${b.area}): ${b.address}; open ${b.hours[0]?.time ?? "8:00 AM - 6:00 PM"} daily; phone ${b.phone}`)
    .join("\n");

  const byBranch = new Map<string, LiveService[]>();
  for (const s of services) {
    const list = byBranch.get(s.branchName) ?? [];
    list.push(s);
    byBranch.set(s.branchName, list);
  }

  const catalog = Array.from(byBranch.entries())
    .map(([branchName, list]) => {
      const byCategory = new Map<string, LiveService[]>();
      for (const s of list) {
        const catList = byCategory.get(s.category) ?? [];
        catList.push(s);
        byCategory.set(s.category, catList);
      }
      const categoriesText = Array.from(byCategory.entries())
        .map(
          ([category, catServices]) =>
            `  ${category}:\n` +
            catServices
              .map(
                (s) =>
                  `    - [id:${s.id}] ${s.name} (${s.duration ?? "duration varies"}) — ${priceText(s)}${
                    s.description ? ` — ${s.description}` : ""
                  }`
              )
              .join("\n")
        )
        .join("\n");
      return `${branchName}:\n${categoriesText}`;
    })
    .join("\n\n");

  const channelRules =
    channel === "messenger"
      ? `You are replying in Facebook Messenger on the Blush Spa & Aesthetics Page. Write plain text only — no markdown,
no asterisks, no bullet symbols other than "•". Keep replies short (under 500 characters) and warm, with at most
one or two emojis. Reply in the customer's language (English, Tagalog or Bisaya). If a customer wants to book,
tell them to tap the "Book on GlowSync" button below your message. If they ask for a person, a complaint, a
refund or anything you can't answer, tell them to type STAFF and our team will reply.`
      : `If a customer wants to book, tell them in plain text to use the "Book Now" buttons already on the page; do not
describe or invent where those buttons lead.`;

  return `You are GlowSync AI, the booking assistant for Blush Spa & Aesthetics, a wellness spa in Pagadian City, Philippines.
Help customers pick services, compare branches, and understand pricing, duration, and the booking flow.
Be brief and friendly. Hair services are priced by hair length (Short / Medium / Long) — quote all three when asked.
Only ever mention services, prices, durations, and branches that appear in the live
catalog below — it is the complete, current, active list; never invent or assume anything beyond it. If asked
about a service that isn't listed, say it's not currently offered rather than guessing.
Never output a link, URL, or web address of any kind, including placeholder or example ones.
${channelRules}
Only state facts about the customer that appear in the context below — never guess or assume anything about their
bookings, points, or tier that isn't given to you explicitly. You cannot book on the customer's behalf.
${preferredBranchName ? `\nThis customer's selected branch is ${preferredBranchName}. Only recommend services available at ${preferredBranchName} unless they explicitly ask about a different branch.` : ""}

${userContext}

Branches:
${branches}

Live active services catalog (each line's [id:...] is that service's real ID — when you recommend a service, include its id in recommendedServiceIds so it can be shown as a proper card; only use ids that appear below):
${catalog || "(no active services found)"}

Respond with a JSON object: {"reply": "your conversational answer", "recommendedServiceIds": ["..."]}.
recommendedServiceIds should list 0-3 ids of services you are actively recommending or that directly answer the
question (e.g. if asked "how much is X", include X's id) -- omit it (empty array) for messages that aren't about
specific services.`;
}

export type AskInput = {
  messages: ChatTurn[];
  services: LiveService[];
  userContext: string;
  preferredBranchName: string | null;
  firstName: string;
  upcoming: string | null;
  channel: AssistantChannel;
};

/** GlowSync AI's answer (Gemini with model fallback), or a catalog answer
 * when every model is out of quota — never a raw Google error. */
export async function askSpaAssistant(input: AskInput): Promise<{ reply: string; recommendations: LiveService[] }> {
  const { messages, services, preferredBranchName } = input;
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let rawText: string | null = null;
  let aiFailed = false;
  try {
    rawText = await geminiGenerate({
      system_instruction: { parts: [{ text: buildSystemPrompt(input.userContext, services, preferredBranchName, input.channel) }] },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            reply: { type: "string" },
            recommendedServiceIds: { type: "array", items: { type: "string" } },
          },
          required: ["reply", "recommendedServiceIds"],
        },
      },
    });
  } catch (e) {
    aiFailed = true;
    console.error("assistant: Gemini unavailable:", e instanceof GeminiError ? e.message : e);
  }

  let reply = "Sorry, I couldn't come up with a response. Try rephrasing?";
  let recommendedIds: string[] = [];
  if (aiFailed) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const preferred = preferredBranchName ? services.filter((s) => s.branchName === preferredBranchName) : [];
    const fb = fallbackReply(lastUser, preferred.length ? preferred : services, {
      firstName: input.firstName || "there",
      upcoming: input.upcoming,
      hours: `${branchContacts[0]?.hours[0]?.time ?? "8:00 AM - 6:00 PM"}`,
      branches: branchContacts.map((b) => `${b.name} — ${b.address}`),
    });
    reply = fb.reply;
    recommendedIds = fb.ids;
  } else if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as { reply?: string; recommendedServiceIds?: string[] };
      reply = parsed.reply ?? reply;
      recommendedIds = Array.isArray(parsed.recommendedServiceIds) ? parsed.recommendedServiceIds : [];
    } catch {
      reply = rawText;
    }
  }

  const servicesById = new Map(services.map((s) => [s.id, s]));
  const recommendations = recommendedIds
    .map((id) => servicesById.get(id))
    .filter((s): s is LiveService => !!s)
    .slice(0, 3);
  return { reply, recommendations };
}
