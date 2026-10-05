import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessengerConfig } from "./config";
import { sendToGraph } from "./graph";
import { buildButtonMessage, buildTextMessage } from "./messages";
import { askSpaAssistant, loadLiveServices, lowestPrice, type ChatTurn, type LiveService } from "@/lib/ai/spaAssistant";
import { priceText } from "@/lib/assistantFallback";
import { loadSpaKnowledge } from "@/lib/ai/spaKnowledge";
import { getUpcomingAppointment, getVisitedBranches } from "@/lib/supabase/queries/myGlow";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";

// GlowSync AI on the Facebook Page (069): answers what people message the
// Page, remembers the last few turns, and steps back for a while when a
// staff member replies from the Page inbox or the customer types STAFF.

export const HISTORY_TURNS = 8;
export const STAFF_PAUSE_HOURS = 12;
const TEXT_LIMIT = 1900; // Messenger allows 2000 characters per text message.

type BotState = { history: ChatTurn[]; paused_until: string | null };

/** Keep only the last few turns (the newest last). */
export function trimHistory(history: ChatTurn[], max = HISTORY_TURNS): ChatTurn[] {
  return history.filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string").slice(-max);
}

export function isPaused(pausedUntil: string | null | undefined, now = new Date()): boolean {
  return !!pausedUntil && Date.parse(pausedUntil) > now.getTime();
}

/** "Recommended for you" lines plus where the button should go. */
export function recommendationButton(recs: LiveService[], siteUrl: string): { text: string; url: string } | null {
  if (recs.length === 0) return null;
  const lines = recs.map((s) => `• ${s.name} — ${s.hairPrices ? priceText(s) : `₱${lowestPrice(s).toLocaleString()}`}`);
  const url = recs.length === 1 ? `${siteUrl}/services/${recs[0].id}` : `${siteUrl}/services?category=${encodeURIComponent(recs[0].category)}`;
  return { text: lines.join("\n"), url };
}

export function welcomeText(firstName: string | null): string {
  return `Hi${firstName ? ` ${firstName}` : ""}! 👋 I'm GlowSync AI, Blush Spa & Aesthetics' assistant ✨\n\nAsk me about our services, prices, promos, branches or your booking. Type STAFF anytime to talk to our team.`;
}

async function loadState(supabase: SupabaseClient, psid: string): Promise<BotState | null> {
  const { data, error } = await supabase.from("messenger_bot_state").select("history, paused_until").eq("psid", psid).maybeSingle();
  if (error) {
    // Before 069 the bot still answers, just without memory or pauses.
    if (!isNotMigratedError(error)) logQueryError("messenger_bot_state", error);
    return null;
  }
  return data ? { history: trimHistory((data.history as ChatTurn[]) ?? []), paused_until: data.paused_until } : { history: [], paused_until: null };
}

async function saveState(supabase: SupabaseClient, psid: string, patch: Partial<BotState>) {
  const { error } = await supabase
    .from("messenger_bot_state")
    .upsert({ psid, ...patch, updated_at: new Date().toISOString() }, { onConflict: "psid" });
  if (error && !isNotMigratedError(error)) logQueryError("messenger_bot_state save", error);
}

export async function pauseBot(supabase: SupabaseClient, psid: string, hours = STAFF_PAUSE_HOURS) {
  await saveState(supabase, psid, { paused_until: new Date(Date.now() + hours * 3_600_000).toISOString() });
}

async function send(config: MessengerConfig, payload: unknown) {
  const res = await sendToGraph(config, payload);
  if (res.status >= 300) console.error("Messenger chatbot send failed:", JSON.stringify(res.body));
}

/** Who this is in GlowSync (if they connected Messenger), for a personal answer. */
async function customerContext(supabase: SupabaseClient, psid: string) {
  const { data: sub } = await supabase.from("messenger_subscriptions").select("profile_id").eq("psid", psid).maybeSingle();
  const profileId = (sub as { profile_id: string } | null)?.profile_id;
  if (!profileId) return { firstName: null as string | null, userContext: "This person isn't linked to a GlowSync account. Don't assume anything about their bookings.", upcoming: null as string | null, branch: null as string | null };
  const [{ data: profile }, upcoming, visited] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle(),
    getUpcomingAppointment(supabase, profileId),
    getVisitedBranches(supabase, profileId),
  ]);
  const name = (profile as { full_name: string | null } | null)?.full_name?.trim() || null;
  const upcomingText = upcoming
    ? `${upcoming.serviceName ?? "a service"}${upcoming.professionalName ? ` with ${upcoming.professionalName}` : ""} on ${upcoming.scheduledDate} at ${upcoming.startTime}`
    : null;
  return {
    firstName: name?.split(/\s+/)[0] ?? null,
    userContext: `The customer you're talking to is ${name ?? "a GlowSync client"}.\n${upcomingText ? `Their next booking is ${upcomingText}.` : "They have no upcoming bookings."}`,
    upcoming: upcomingText,
    branch: visited[0]?.name ?? null,
  };
}

/** Answers one message sent to the Page. */
export async function answerMessengerUser(supabase: SupabaseClient, config: MessengerConfig, psid: string, text: string | null) {
  const state = await loadState(supabase, psid);
  if (isPaused(state?.paused_until)) return; // a staff member is handling this chat

  const who = await customerContext(supabase, psid);

  // Get Started / a sticker or photo with no text: just say hello.
  if (!text) {
    await send(config, buildButtonMessage(psid, welcomeText(who.firstName), "Book on GlowSync", `${config.siteUrl}/services`, "RESPONSE"));
    return;
  }

  await send(config, { recipient: { id: psid }, sender_action: "typing_on" });

  const [services, knowledge] = await Promise.all([loadLiveServices(supabase), loadSpaKnowledge(supabase).catch(() => null)]);
  const history = trimHistory([...(state?.history ?? []), { role: "user", content: text.slice(0, 1000) }]);
  const { reply, recommendations } = await askSpaAssistant({
    knowledge,
    messages: history,
    services,
    userContext: who.userContext,
    preferredBranchName: who.branch,
    firstName: who.firstName ?? "",
    upcoming: who.upcoming,
    channel: "messenger",
  });

  const answer = reply.slice(0, TEXT_LIMIT);
  const button = recommendationButton(recommendations, config.siteUrl);
  if (button && answer.length + button.text.length + 2 <= 600) {
    // One message: the answer, the services and a booking button.
    await send(config, buildButtonMessage(psid, `${answer}\n\n${button.text}`, "Book on GlowSync", button.url, "RESPONSE"));
  } else {
    await send(config, buildTextMessage(psid, answer));
    if (button) await send(config, buildButtonMessage(psid, button.text, "Book on GlowSync", button.url, "RESPONSE"));
  }

  if (state) await saveState(supabase, psid, { history: trimHistory([...history, { role: "assistant", content: answer }]) });
}
