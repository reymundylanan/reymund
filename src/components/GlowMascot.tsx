/** GlowSync AI's mascot: a little gold robot with a dark visor face,
 * happy eyes, blush cheeks, headphones and a gold flame tuft. `full` adds
 * the body with a "G" and a waving hand. `pose` changes the arms and face
 * (pointing, thinking, love, relaxed, flying); `blink` adds idle blinking.
 * Animations live in globals.css (.glowy-*) and switch off for reduced motion. */
export type MascotPose = "wave" | "point" | "think" | "love" | "relax" | "fly";

export default function GlowMascot({
  size = 40,
  full = false,
  talking = false,
  pose = "wave",
  blink = false,
}: {
  size?: number;
  full?: boolean;
  talking?: boolean;
  pose?: MascotPose;
  blink?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={full ? "8 0 112 120" : "14 2 92 92"}
      aria-hidden
      className="block overflow-visible"
    >
      <defs>
        <linearGradient id="glowy-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3d98b" />
          <stop offset="55%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#a8843a" />
        </linearGradient>
        <radialGradient id="glowy-shell" cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#fbf3e2" />
          <stop offset="100%" stopColor="#efdcb4" />
        </radialGradient>
        <radialGradient id="glowy-visor" cx="45%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3d2b22" />
          <stop offset="100%" stopColor="#1d1410" />
        </radialGradient>
      </defs>

      {full && (
        <g>
          {/* Body with the G badge */}
          <path d="M40 86q20-8 40 0l3 22q-23 9-46 0z" fill="url(#glowy-shell)" stroke="#c9a24a" strokeWidth="2.5" />
          <path d="M40 86q-4 10-3 22l6 2q-1-12 2-23z" fill="url(#glowy-gold)" />
          <path d="M80 86q4 10 3 22l-6 2q1-12-2-23z" fill="url(#glowy-gold)" />
          <text x="60" y="104" textAnchor="middle" fontSize="15" fontWeight="800" fill="#c9a24a" fontFamily="system-ui, sans-serif">
            G
          </text>
          {/* Left arm */}
          {pose === "fly" ? (
            <path d="M40 92q-12 0-18-8" fill="none" stroke="url(#glowy-gold)" strokeWidth="8" strokeLinecap="round" />
          ) : (
            <ellipse cx="36" cy="96" rx="5" ry="8" fill="url(#glowy-gold)" transform="rotate(20 36 96)" />
          )}
          {/* Right arm */}
          {pose === "point" ? (
            <g className="glowy-point">
              <path d="M80 93q12 0 22-5" fill="none" stroke="url(#glowy-gold)" strokeWidth="8" strokeLinecap="round" />
              <circle cx="106" cy="86" r="6.5" fill="url(#glowy-shell)" stroke="#c9a24a" strokeWidth="2" />
              <path d="M111 84l8-3" stroke="#c9a24a" strokeWidth="3.4" strokeLinecap="round" />
            </g>
          ) : pose === "think" ? (
            <g>
              <path d="M80 94q8-2 2-14" fill="none" stroke="url(#glowy-gold)" strokeWidth="8" strokeLinecap="round" />
              <circle cx="78" cy="77" r="6.5" fill="url(#glowy-shell)" stroke="#c9a24a" strokeWidth="2" />
            </g>
          ) : pose === "fly" ? (
            <path d="M80 92q12 0 18-8" fill="none" stroke="url(#glowy-gold)" strokeWidth="8" strokeLinecap="round" />
          ) : pose === "relax" ? (
            <ellipse cx="84" cy="96" rx="5" ry="8" fill="url(#glowy-gold)" transform="rotate(-20 84 96)" />
          ) : (
            <g className="glowy-wave">
              <path d="M80 92q12-4 16-18" fill="none" stroke="url(#glowy-gold)" strokeWidth="8" strokeLinecap="round" />
              <circle cx="97" cy="70" r="7.5" fill="url(#glowy-shell)" stroke="#c9a24a" strokeWidth="2" />
              <path d="M93 64v-5M97 63v-6M101 64v-5" stroke="#c9a24a" strokeWidth="2.4" strokeLinecap="round" />
            </g>
          )}
        </g>
      )}

      {/* Flame tuft */}
      <path d="M60 24c-9-5-9-15-2-21-1 6 5 7 4 13 3-2 4-5 4-8 5 6 3 13-6 16z" fill="url(#glowy-gold)" />

      {/* Headphones */}
      <circle cx="27" cy="54" r="10" fill="url(#glowy-gold)" stroke="#a8843a" strokeWidth="1.5" />
      <circle cx="27" cy="54" r="5.5" fill="#f3d98b" />
      <circle cx="93" cy="54" r="10" fill="url(#glowy-gold)" stroke="#a8843a" strokeWidth="1.5" />
      <circle cx="93" cy="54" r="5.5" fill="#f3d98b" />

      {/* Helmet + visor */}
      <ellipse cx="60" cy="53" rx="33" ry="30" fill="url(#glowy-shell)" stroke="#c9a24a" strokeWidth="3" />
      <ellipse cx="60" cy="55" rx="25" ry="20" fill="url(#glowy-visor)" />
      <ellipse cx="50" cy="42" rx="7" ry="2.5" fill="#ffffff" opacity="0.18" />

      {/* Eyes */}
      {pose === "love" ? (
        <path d="M50 58l-5-5a3 3 0 0 1 5-3a3 3 0 0 1 5 3zM70 58l-5-5a3 3 0 0 1 5-3a3 3 0 0 1 5 3z" fill="#ff7aa2" stroke="#ff7aa2" strokeWidth="1.5" strokeLinejoin="round" />
      ) : pose === "relax" ? (
        <path d="M45 53q5 5 10 0M65 53q5 5 10 0" fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />
      ) : pose === "think" ? (
        <g fill="#ffffff">
          <ellipse cx="52" cy="50" rx="3.4" ry="4.4" />
          <ellipse cx="72" cy="50" rx="3.4" ry="4.4" />
        </g>
      ) : (
        <g className={blink ? "glowy-blink" : undefined}>
          <path d="M45 55q5-8 10 0M65 55q5-8 10 0" fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />
        </g>
      )}

      {/* Cheeks */}
      <ellipse cx="44" cy="63" rx="4.2" ry="2.6" fill="#f29a9a" />
      <ellipse cx="76" cy="63" rx="4.2" ry="2.6" fill="#f29a9a" />

      {/* Mouth */}
      <g className={talking ? "glowy-talk" : undefined}>
        <path d="M54 62q6 9 12 0z" fill="#e85d6b" />
        <path d="M57 66q3-2 6 0q-3 2.5-6 0z" fill="#ff9aa6" />
      </g>
    </svg>
  );
}
