export type MessagingEvent = {
  sender?: { id?: string };
  message?: { text?: string; is_echo?: boolean };
  postback?: { payload?: string; referral?: { ref?: string } };
  referral?: { ref?: string };
};

export type WebhookAction =
  | { type: "link"; psid: string; ref: string }
  | { type: "stop"; psid: string }
  | { type: "start"; psid: string }
  | { type: "inbound"; psid: string }
  | { type: "ignore" };

export function parseMessagingEvent(e: MessagingEvent): WebhookAction {
  const psid = e.sender?.id;
  if (!psid || e.message?.is_echo) return { type: "ignore" };

  // New threads deliver the m.me ref on the Get Started postback;
  // existing threads deliver it as a standalone referral event.
  const ref = e.referral?.ref ?? e.postback?.referral?.ref;
  if (ref) return { type: "link", psid, ref };

  const text = e.message?.text?.trim().toUpperCase();
  if (text === "STOP") return { type: "stop", psid };
  if (text === "START") return { type: "start", psid };

  if (e.message || e.postback) return { type: "inbound", psid };
  return { type: "ignore" };
}
