import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { branchContacts } from "@/lib/data";
import { getUpcomingAppointment, getVisitedBranches } from "@/lib/supabase/queries/myGlow";
import { getTierProgress } from "@/lib/myGlowTiers";
import { logQueryError } from "@/lib/supabase/logQueryError";

const GEMINI_MODEL = "gemini-2.5-flash-lite";

type LiveService = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string | null;
  price: number;
  description: string | null;
  branchId: string;
  branchName: string;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Live, active-only service catalog — replaces the old hardcoded
 * branchServiceCategories list, so a service added/edited/deactivated
 * in Branches & Services shows up (or disappears) here immediately
 * with no code change. */
async function loadLiveServices(supabase: Awaited<ReturnType<typeof createClient>>): Promise<LiveService[]> {
  const { data, error } = await supabase
    .from("branch_services")
    .select("id, name, category, department, duration, price, description, branch_id, status, branch:branches(name)")
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
    branch: Rel<{ name: string }>;
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
  }));
}

function buildSystemPrompt(userContext: string, services: LiveService[], preferredBranchName: string | null) {
  const branches = branchContacts
    .map((b) => `- ${b.name} (${b.area}): ${b.address}`)
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
                  `    - [id:${s.id}] ${s.name} (${s.duration ?? "duration varies"}) — ₱${s.price.toLocaleString()}${
                    s.description ? ` — ${s.description}` : ""
                  }`
              )
              .join("\n")
        )
        .join("\n");
      return `${branchName}:\n${categoriesText}`;
    })
    .join("\n\n");

  return `You are the GlowSync booking assistant for Blush Spa & Aesthetics, a wellness spa in Pagadian City, Philippines.
Help customers pick services, compare branches, and understand pricing, duration, and the booking flow.
Be brief and friendly. Only ever mention services, prices, durations, and branches that appear in the live
catalog below — it is the complete, current, active list; never invent or assume anything beyond it. If asked
about a service that isn't listed, say it's not currently offered rather than guessing.
Never output a link, URL, or web address of any kind, including placeholder or example ones — this app has no
externally browsable service pages. If a customer wants to book, tell them in plain text to use the "Book Now"
buttons already on the page; do not describe or invent where those buttons lead. Only state facts about the
customer that appear in the context below — never guess or assume anything about their bookings, points, or
tier that isn't given to you explicitly. You cannot book on the customer's behalf.
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

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, loyalty_points")
    .eq("id", auth.user.id)
    .single();

  if (profile?.role !== "customer") {
    return NextResponse.json(
      { error: "Assistant is available for customer accounts only." },
      { status: 403 }
    );
  }

  const { messages } = (await request.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No messages provided." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Assistant is not configured." }, { status: 500 });
  }

  const [upcoming, visitedBranches, services] = await Promise.all([
    getUpcomingAppointment(supabase, auth.user.id),
    getVisitedBranches(supabase, auth.user.id),
    loadLiveServices(supabase),
  ]);
  const { data: rewards, error: rewardsError } = await supabase
    .from("client_rewards")
    .select("current_points, lifetime_earned")
    .eq("client_id", auth.user.id)
    .maybeSingle();
  if (rewardsError) logQueryError("assistant client_rewards", rewardsError);
  const balance = rewards?.current_points ?? profile.loyalty_points;
  const tier = getTierProgress(rewards?.lifetime_earned ?? profile.loyalty_points);
  const preferredBranchName = visitedBranches[0]?.name ?? null;

  const userContext = `The customer you're talking to is ${profile.full_name}.
Their loyalty status: ${balance} GlowPoints, ${tier.tier} tier.
${
  upcoming
    ? `Their next booking is ${upcoming.serviceName ?? "a service"}${
        upcoming.professionalName ? ` with ${upcoming.professionalName}` : ""
      } on ${upcoming.scheduledDate} at ${upcoming.startTime}.`
    : "They have no upcoming bookings."
}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemPrompt(userContext, services, preferredBranchName) }] },
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
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    return NextResponse.json(
      { error: errBody?.error?.message ?? "Assistant request failed." },
      { status: 502 }
    );
  }

  const data = await res.json();
  const rawText: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;

  let reply = "Sorry, I couldn't come up with a response. Try rephrasing?";
  let recommendedIds: string[] = [];
  if (rawText) {
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
    .slice(0, 3)
    .map((s) => ({ id: s.id, name: s.name, price: s.price, description: s.description, category: s.category }));

  return NextResponse.json({ reply, recommendations });
}
