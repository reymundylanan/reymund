import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geminiChatJson } from "@/lib/ai/gemini";
import { loadReportData } from "@/lib/supabase/queries/reportData";
import { trimConversation, type ChatTurn } from "@/lib/reviewAssistant";
import {
  REPORT_ASSISTANT_SCHEMA,
  REPORT_ASSISTANT_SYSTEM,
  buildReportFacts,
  isReportType,
  validPeriod,
} from "@/lib/reportAssistant";
import type { ReportFilters } from "@/lib/reports/model";

export const maxDuration = 30;

const UUID = /^[0-9a-f-]{36}$/i;

/** Admin-only: answers questions about the report data for the chosen
 * period and filters. Read-only. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    messages?: ChatTurn[];
    filters?: { from?: string; to?: string; branchId?: string | null; staffId?: string | null };
  } | null;
  const turns = trimConversation(Array.isArray(body?.messages) ? body!.messages : []);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }
  const period = validPeriod(body?.filters?.from, body?.filters?.to);
  if (!period) return NextResponse.json({ error: "Choose a date range of up to one year." }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "The AI assistant isn't set up (GEMINI_API_KEY is missing)." }, { status: 503 });
  }

  const pick = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
  const filters: ReportFilters = {
    ...period,
    branchId: pick(body?.filters?.branchId),
    staffId: pick(body?.filters?.staffId),
    service: null,
    status: null,
    rating: null,
  };

  let facts;
  try {
    facts = buildReportFacts(await loadReportData(supabase, filters.from, filters.to), filters);
  } catch (e) {
    console.error("report assistant data failed:", e);
    return NextResponse.json({ error: "Couldn't load the report data. Please try again." }, { status: 500 });
  }

  const scope = [
    `Period: ${filters.from} to ${filters.to}`,
    filters.branchId ? "Filtered to one branch (see the reports)" : "All branches",
    filters.staffId ? "Filtered to one staff member" : "All staff",
  ].join(" · ");
  const context = `FACTS (${scope}):\n${JSON.stringify(facts)}`;

  const geminiTurns = turns.map((t, i) => ({
    role: t.role === "assistant" ? ("model" as const) : ("user" as const),
    // The data rides on the latest question so it's always current.
    text: i === turns.length - 1 ? `${context}\n\nQUESTION: ${t.content}` : t.content,
  }));

  try {
    const raw = await geminiChatJson({ system: REPORT_ASSISTANT_SYSTEM, turns: geminiTurns, schema: REPORT_ASSISTANT_SCHEMA, timeoutMs: 25_000 });
    const parsed = raw ? (JSON.parse(raw) as { answer?: string; reports?: unknown[] }) : null;
    if (!parsed?.answer) throw new Error("empty answer");
    const reports = [...new Set((parsed.reports ?? []).filter(isReportType))].slice(0, 2);
    return NextResponse.json({ answer: parsed.answer.slice(0, 4000), reports });
  } catch (e) {
    console.error("report assistant failed:", e);
    return NextResponse.json({ error: "The assistant couldn't answer right now (the AI may be busy). Please try again in a minute." }, { status: 502 });
  }
}
