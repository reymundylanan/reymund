// One-time (idempotent) Messenger Page setup:
//   node --env-file=.env.local scripts/messenger-setup.ts
// 1. Get Started button + greeting (needed for m.me ref links on new threads)
// 2. Creates the appointment utility templates if missing and prints their status
import {
  APPOINTMENT_TEMPLATES,
  templateCreatePayload,
  type AppointmentTemplateKind,
} from "../src/lib/messenger/templates.ts";

const GRAPH = "https://graph.facebook.com/v23.0";
const pageId = process.env.MESSENGER_PAGE_ID;
const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

if (!pageId || !token || !siteUrl) {
  console.error("Set MESSENGER_PAGE_ID, MESSENGER_PAGE_ACCESS_TOKEN and NEXT_PUBLIC_SITE_URL first.");
  process.exit(1);
}

async function graph(method: string, path: string, body?: unknown) {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, json };
}

const profile = await graph("POST", "/me/messenger_profile", {
  get_started: { payload: "GET_STARTED" },
  greeting: [
    {
      locale: "default",
      text: "Hi {{user_first_name}}! Tap Get Started to receive your GlowSync appointment reminders and updates.",
    },
  ],
});
console.log(profile.ok ? "✓ Get Started + greeting set" : `✗ Messenger profile: ${JSON.stringify(profile.json)}`);

for (const kind of Object.keys(APPOINTMENT_TEMPLATES) as AppointmentTemplateKind[]) {
  const { name } = APPOINTMENT_TEMPLATES[kind];
  const existing = await graph("GET", `/${pageId}/message_templates?name=${name}&fields=name,status`);
  const found = (existing.json?.data ?? []).find((t: { name: string }) => t.name === name);
  if (found) {
    console.log(`• ${name}: ${found.status}`);
    continue;
  }
  const created = await graph("POST", `/${pageId}/message_templates`, templateCreatePayload(kind, siteUrl));
  console.log(created.ok ? `✓ ${name} created: ${JSON.stringify(created.json)}` : `✗ ${name}: ${JSON.stringify(created.json)}`);
}
