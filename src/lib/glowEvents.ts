// How the Services-page guide and the floating GlowSync AI chat act as one
// character. They live in different parts of the page, so they talk through
// window events.

/** The guide is on screen or not: the floating character flies to it, or back
 * to its corner. detail: GuideActiveDetail. */
export const GUIDE_ACTIVE_EVENT = "glowsync:guide-active";
export type ScreenRect = { x: number; y: number; w: number; h: number };
export type GuideActiveDetail = { active: boolean; /** where the guide's mascot is on screen (computers) */ rect: ScreenRect | null };
/** How long the character's flight between the corner and the cards takes. */
export const FLIGHT_MS = 900;
/** The chat panel opened or closed (detail: boolean): the guide pauses while it's open. */
export const CHAT_PANEL_EVENT = "glowsync:chat-panel";
/** Open the chat about a topic (detail: { topic?: string }). Cancelled = the chat handled it. */
export const OPEN_CHAT_EVENT = "glowsync:open-chat";

export function announce(event: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

/** Asks the floating chat to open (optionally about a service). False if there's no chat on this page. */
export function requestChat(topic?: string): boolean {
  return !window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { topic }, cancelable: true }));
}
