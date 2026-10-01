import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geminiChatJson } from "@/lib/ai/gemini";
import { getReviewFilterOptions } from "@/lib/supabase/queries/adminReviews";
import { logQueryError } from "@/lib/supabase/logQueryError";
import {
  ASSISTANT_SCHEMA,
  ASSISTANT_SYSTEM,
  actionHref,
  buildReviewFacts,
  reviewLines,
  trimConversation,
  type AssistantAction,
  type AssistantReview,
  type ChatTurn,
} from "@/lib/reviewAssistant";

export const maxDuration = 30;

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  return !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;
}

type Raw = {
  id: string;
  target_type: "service" | "staff" | "branch";
  rating: number;
  text: string | null;
  status: string;
  created_at: string;
  appointment_id: string | null;
  service_position: number | null;
  client: Rel<{ full_name: string | null }>;
  staff: Rel<{ full_name: string }>;
  branch: Rel<{ name: string }>;
  service: Rel<{ name: string }>;
  review_photos: { count: number }[] | null;
};

function manilaDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** Admin-only: answers questions about the real reviews. Read-only. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { messages?: ChatTurn[] } | null;
  const turns = trimConversation(Array.isArray(body?.messages) ? body!.messages : []);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "The AI assistant isn't set up (GEMINI_API_KEY is missing)." }, { status: 503 });
  }

  const [{ data, error }, options] = await Promise.all([
    supabase
      .from("reviews")
      .select(
        "id, target_type, rating, text, status, created_at, appointment_id, service_position, client:profiles!reviews_client_id_fkey(full_name), staff:staff_members(full_name), branch:branches(name), service:branch_services(name), review_photos(count)"
      )
      .order("created_at", { ascending: false })
      .limit(2000),
    getReviewFilterOptions(supabase),
  ]);
  if (error) {
    logQueryError("review assistant reviews", error);
    return NextResponse.json({ error: "Couldn't load reviews. Please try again." }, { status: 500 });
  }

  const raws = (data ?? []) as unknown as Raw[];
  // Service reviews whose branch service was renamed/removed keep the booked name.
  const missing = [...new Set(raws.filter((r) => r.target_type === "service" && !one(r.service) && r.appointment_id).map((r) => r.appointment_id as string))];
  const booked = new Map<string, string>();
  if (missing.length) {
    const { data: rows } = await supabase.from("appointment_services").select("appointment_id, position, service_name").in("appointment_id", missing);
    for (const b of (rows ?? []) as { appointment_id: string; position: number; service_name: string }[]) booked.set(`${b.appointment_id}:${b.position}`, b.service_name);
  }

  const reviews: AssistantReview[] = raws.map((r) => ({
    id: r.id,
    type: r.target_type,
    rating: r.rating,
    text: r.text,
    status: r.status,
    date: manilaDate(r.created_at),
    client: one(r.client)?.full_name ?? "Client",
    target:
      r.target_type === "staff"
        ? one(r.staff)?.full_name ?? "Former staff"
        : r.target_type === "branch"
          ? one(r.branch)?.name ?? "Branch"
          : one(r.service)?.name ?? booked.get(`${r.appointment_id}:${r.service_position}`) ?? "Service",
    photos: r.review_photos?.[0]?.count ?? 0,
  }));

  const today = manilaDate(new Date().toISOString());
  const facts = buildReviewFacts(reviews, today);
  const context = `FACTS (computed from all ${reviews.length} reviews; today is ${today}):\n${JSON.stringify(facts)}\n\n<reviews>\n${reviewLines(reviews)}\n</reviews>`;

  const geminiTurns = turns.map((t, i) => ({
    role: t.role === "assistant" ? ("model" as const) : ("user" as const),
    // The data rides on the latest question so it's always current.
    text: i === turns.length - 1 ? `${context}\n\nQUESTION: ${t.content}` : t.content,
  }));

  try {
    const raw = await geminiChatJson({ system: ASSISTANT_SYSTEM, turns: geminiTurns, schema: ASSISTANT_SCHEMA, timeoutMs: 25_000 });
    const parsed = raw ? (JSON.parse(raw) as { answer?: string; actions?: AssistantAction[] }) : null;
    if (!parsed?.answer) throw new Error("empty answer");
    const actions = (parsed.actions ?? [])
      .filter((a) => a && typeof a.label === "string" && a.label.trim())
      .slice(0, 3)
      .map((a) => ({ label: a.label.trim().slice(0, 60), href: actionHref(a, options) }));
    return NextResponse.json({ answer: parsed.answer.slice(0, 4000), actions });
  } catch (e) {
    console.error("review assistant failed:", e);
    return NextResponse.json({ error: "The assistant couldn't answer right now. Please try again." }, { status: 502 });
  }
}
