import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUpcomingAppointment, getVisitedBranches } from "@/lib/supabase/queries/myGlow";
import { getTierProgress } from "@/lib/myGlowTiers";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { askSpaAssistant, loadLiveServices, lowestPrice, type ChatTurn } from "@/lib/ai/spaAssistant";

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

  const { messages } = (await request.json()) as { messages: ChatTurn[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No messages provided." }, { status: 400 });
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
  const upcomingText = upcoming
    ? `${upcoming.serviceName ?? "a service"}${upcoming.professionalName ? ` with ${upcoming.professionalName}` : ""} on ${upcoming.scheduledDate} at ${upcoming.startTime}`
    : null;

  const userContext = `The customer you're talking to is ${profile.full_name}.
Their loyalty status: ${balance} GlowPoints, ${tier.tier} tier.
${upcomingText ? `Their next booking is ${upcomingText}.` : "They have no upcoming bookings."}`;

  const { reply, recommendations } = await askSpaAssistant({
    messages,
    services,
    userContext,
    preferredBranchName: visitedBranches[0]?.name ?? null,
    firstName: profile.full_name?.split(" ")[0] ?? "",
    upcoming: upcomingText,
    channel: "web",
  });

  return NextResponse.json({
    reply,
    recommendations: recommendations.map((s) => ({
      id: s.id,
      name: s.name,
      // Hair: the lowest length price, so the card never shows ₱0.
      price: lowestPrice(s),
      description: s.description,
      category: s.category,
    })),
  });
}
