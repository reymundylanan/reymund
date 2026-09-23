import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { branchContacts, branchServiceCategories } from "@/lib/data";
import { getUpcomingAppointment } from "@/lib/supabase/queries/myGlow";
import { getTierProgress } from "@/lib/myGlowTiers";

const GEMINI_MODEL = "gemini-2.5-flash-lite";

function buildSystemPrompt(userContext: string) {
  const branches = branchContacts
    .map((b) => `- ${b.name} (${b.area}): ${b.address}`)
    .join("\n");

  const services = branchServiceCategories
    .map(
      (cat) =>
        `${cat.label}:\n` +
        cat.services.map((s) => `  - ${s.name} (${s.duration}) — ₱${s.price}`).join("\n")
    )
    .join("\n");

  return `You are the GlowSync booking assistant for Blush Spa & Aesthetics, a wellness spa in Pagadian City, Philippines.
Help customers pick services, compare branches, and understand pricing and the booking flow.
Be brief and friendly. Do not invent services, prices, branches, links, or URLs beyond what's listed below.
Never output a link, URL, or web address of any kind, including placeholder or example ones — this app has no
externally browsable service pages. If a customer wants to book, tell them in plain text to use the "Book an
Experience" / "Book Now" buttons already on the page they're viewing; do not describe or invent where those
buttons lead. Only state facts about the customer that appear in the context below — never guess or assume
anything about their bookings, points, or tier that isn't given to you explicitly.
You cannot book on the customer's behalf.

${userContext}

Branches:
${branches}

Services:
${services}`;
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

  const upcoming = await getUpcomingAppointment(supabase, auth.user.id);
  const tier = getTierProgress(profile.loyalty_points);

  const userContext = `The customer you're talking to is ${profile.full_name}.
Their loyalty status: ${tier.points} Glow Points, ${tier.tier} tier.
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
        system_instruction: { parts: [{ text: buildSystemPrompt(userContext) }] },
        contents,
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
  const reply: string =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    "Sorry, I couldn't come up with a response. Try rephrasing?";

  return NextResponse.json({ reply });
}
