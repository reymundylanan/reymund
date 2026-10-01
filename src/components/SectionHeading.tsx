/** Public-site section title: small gold eyebrow, serif title, optional
 * subtitle and an ornament line. */
export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "mx-auto mb-10 max-w-2xl text-center" : "mb-8 max-w-2xl"}>
      {eyebrow && (
        <p className={`flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-coral-dark ${centered ? "justify-center" : ""}`}>
          <span className="h-px w-8 bg-champagne" aria-hidden />
          {eyebrow}
          {centered && <span className="h-px w-8 bg-champagne" aria-hidden />}
        </p>
      )}
      <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-base leading-relaxed text-ink/65">{subtitle}</p>}
    </div>
  );
}
