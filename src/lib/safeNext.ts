// Only same-site absolute paths may be used as post-login redirect
// targets. Anything else ("@evil.com", "//evil.com", "/\evil.com",
// schemes, control characters) falls back to "/" — otherwise
// `${origin}${next}` can be turned into a link to another site.
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}
