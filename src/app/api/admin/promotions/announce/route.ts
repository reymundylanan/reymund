import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailSender } from "@/lib/notifications/senders";
import { buildPromoEmail, groupPromos } from "@/lib/notifications/promoEmail";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";

// Gmail sends one by one.
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Admin saved a new promo: email it once to clients who opted in to
 * exclusive offers (066) and haven't turned email off (068). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { ids?: unknown[] } | null;
  const ids = (Array.isArray(body?.ids) ? body!.ids : []).filter((v): v is string => typeof v === "string" && UUID.test(v)).slice(0, 20);
  if (ids.length === 0) return NextResponse.json({ sent: 0, recipients: 0, skipped: "no_promos" });

  const sendEmail = getEmailSender();
  if (!sendEmail) return NextResponse.json({ sent: 0, recipients: 0, skipped: "email_not_configured" });

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  // Claim the promos (so a double click or a second save can't email twice).
  const { data: claimed, error: claimError } = await admin
    .from("branch_promotions")
    .update({ announced_at: new Date().toISOString() })
    .in("id", ids)
    .is("announced_at", null)
    .eq("is_active", true)
    .or(`valid_from.is.null,valid_from.lte.${today}`)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .select("id, title, description, badge, price, valid_until, branch:branches(name)");
  if (claimError) {
    if (isNotMigratedError(claimError)) return NextResponse.json({ sent: 0, recipients: 0, skipped: "apply_migration_071" });
    logQueryError("promo announce claim", claimError);
    return NextResponse.json({ error: "Couldn't prepare the promo email." }, { status: 500 });
  }
  type PromoRow = { id: string; title: string; description: string | null; badge: string | null; price: number | null; valid_until: string | null; branch: Rel<{ name: string }> };
  const rows = ((claimed ?? []) as unknown as PromoRow[]).map((p) => ({ ...p, branchName: one(p.branch)?.name ?? null }));
  if (rows.length === 0) return NextResponse.json({ sent: 0, recipients: 0, skipped: "already_sent_or_not_active" });

  // Opted-in clients with an email, minus anyone who turned email off.
  const [{ data: optedIn, error: recipientsError }, { data: offRows }] = await Promise.all([
    admin.from("profiles").select("id, email").eq("role", "customer").eq("marketing_opt_in", true).not("email", "is", null),
    admin.from("notification_preferences").select("profile_id").eq("email_enabled", false),
  ]);
  if (recipientsError) {
    logQueryError("promo announce recipients", recipientsError);
    return NextResponse.json({ error: "Couldn't load who to email." }, { status: 500 });
  }
  const off = new Set(((offRows ?? []) as { profile_id: string }[]).map((r) => r.profile_id));
  const emails = [
    ...new Set(
      ((optedIn ?? []) as { id: string; email: string }[])
        .filter((p) => !off.has(p.id))
        .map((p) => p.email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().startsWith("https://")
    ? process.env.NEXT_PUBLIC_SITE_URL!.trim()
    : new URL(request.url).origin;

  let sent = 0;
  for (const { first, branchNames } of groupPromos(rows)) {
    const mail = buildPromoEmail(
      { id: first.id, title: first.title, description: first.description, badge: first.badge, price: first.price, validUntil: first.valid_until, branchNames },
      siteUrl
    );
    for (const to of emails) {
      try {
        await sendEmail(to, mail);
        sent += 1;
      } catch (err) {
        console.error("promo announce send failed:", to, err);
      }
    }
  }
  return NextResponse.json({ sent, recipients: emails.length });
}
