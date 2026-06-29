import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { branchContacts, branchServiceCategories } from "@/lib/data";

const GEMINI_MODEL = "gemini-2.5-flash-lite";

function buildSystemPrompt() {
  const branches = branchContacts
    .map((b) => `- ${b.name} (${b.area}): ${b.address}`)
    .join("\n");

  const services = branchServiceCategories
    .map(
      (cat) =>
        `${cat.label}:\n` +
        cat.services
          .map((s) => `  - ${s.name} (${s.duration}) — ₱${s.price}`)
          .join("\n")
    )
    .join("\n");

  return `You are the GlowSync booking assistant for Blush Spa & Aesthetics, a wellness spa in Pagadian City, Philippines.
Help customers pick services, compare branches, and understand pricing and the booking flow.
Be brief and friendly. Do not invent services, prices, or branches beyond what's listed below.
You cannot book on the customer's behalf — direct them to use the "Book an Experience" / "Book Now" buttons on the site.

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
    .select("role")
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
        system_instruction: { parts: [{ text: buildSystemPrompt() }] },
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
