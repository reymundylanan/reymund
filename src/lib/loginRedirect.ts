import { safeNext } from "./safeNext";

// Where protected client pages send signed-out visitors: the home page
// with the Login modal open, continuing to `path` after sign-in
// (handled by IntentHandler).
export function loginRedirectPath(path: string): string {
  return `/?login=1&next=${encodeURIComponent(safeNext(path))}`;
}
