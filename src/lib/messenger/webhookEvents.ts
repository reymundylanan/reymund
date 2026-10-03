// Every message GlowSync sends is tagged with this metadata; an echo without
// it was typed by a person in the Page inbox (so the chatbot steps back).
export const BOT_METADATA = "glowsync";

export type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { text?: string; is_echo?: boolean; metadata?: string; quick_reply?: { payload?: string } };
  postback?: { payload?: string; title?: string; referral?: { ref?: string } };
  referral?: { ref?: string };
};

export type WebhookAction =
  | { type: "link"; psid: string; ref: string }
  | { type: "stop"; psid: string }
  | { type: "start"; psid: string }
  | { type: "staff"; psid: string }
  | { type: "inbound"; psid: string; text: string | null }
  | { type: "staff_replied"; psid: string }
  | { type: "ignore" };

const STAFF_WORDS = /^(staff|human|agent|person|tao|admin|talk to (a |the )?(staff|person|human))[.!?]*$/i;

export function parseMessagingEvent(e: MessagingEvent): WebhookAction {
  // An echo is a message the Page sent. Typed by a person (not GlowSync)?
  // Then pause the chatbot for that customer.
  if (e.message?.is_echo) {
    const customer = e.recipient?.id;
    return customer && e.message.metadata !== BOT_METADATA ? { type: "staff_replied", psid: customer } : { type: "ignore" };
  }

  const psid = e.sender?.id;
  if (!psid) return { type: "ignore" };

  // New threads deliver the m.me ref on the Get Started postback;
  // existing threads deliver it as a standalone referral event.
  const ref = e.referral?.ref ?? e.postback?.referral?.ref;
  if (ref) return { type: "link", psid, ref };

  const raw = e.message?.text?.trim() ?? "";
  const upper = raw.toUpperCase();
  if (upper === "STOP") return { type: "stop", psid };
  if (upper === "START") return { type: "start", psid };
  if (raw && STAFF_WORDS.test(raw)) return { type: "staff", psid };

  if (e.message) return { type: "inbound", psid, text: raw || null };
  // A tapped button (e.g. Get Started) has no text; its title is what they "said".
  if (e.postback) return { type: "inbound", psid, text: e.postback.payload === "GET_STARTED" ? null : e.postback.title?.trim() || null };
  return { type: "ignore" };
}
