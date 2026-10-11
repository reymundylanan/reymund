/**
 * Whether this client has had GlowSync AI's My Glow tour yet (per device).
 * Until then, booking success shows the full "your records live in My Glow"
 * introduction and My Glow opens with the tour. Storage can be blocked —
 * then the client simply sees the introduction again.
 */
const key = (userId: string) => `glowsync.myGlowTour.${userId}`;

export function hasSeenMyGlowTour(userId: string): boolean {
  try {
    return window.localStorage.getItem(key(userId)) === "done";
  } catch {
    return false;
  }
}

export function markMyGlowTourSeen(userId: string): void {
  try {
    window.localStorage.setItem(key(userId), "done");
  } catch {
    /* storage blocked — nothing to remember */
  }
}
