/** GlowSync AI's mascot: a little white-and-gold robot with a dark glossy
 * visor face, happy eyes, blush cheeks, gold headphones and a gold sprout
 * tuft. Shaded with soft lighting, highlights and a glossy visor so it reads
 * as a 3D game companion.
 *
 * `full` adds the body with the "G" emblem and arms. `pose` changes the arms
 * and face; `flip` mirrors the arms (to point left); `blink` adds idle
 * blinking; `alive` adds head tilts, looking around and breathing.
 * Animations live in globals.css (.glowy-*) and switch off for reduced motion. */
export type MascotPose = "wave" | "point" | "think" | "love" | "relax" | "fly" | "cheek" | "hands" | "excited";

function Hand({ cx, cy, r = 6.5 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#glowy-shell)" stroke="#c9a24a" strokeWidth="2" />
      <circle cx={cx - r * 0.35} cy={cy - r * 0.35} r={r * 0.3} fill="#ffffff" opacity="0.8" />
    </g>
  );
}

function Arm({ d }: { d: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke="#8a6a2a" strokeOpacity="0.25" strokeWidth="9.5" strokeLinecap="round" transform="translate(0.8 1.2)" />
      <path d={d} fill="none" stroke="url(#glowy-gold)" strokeWidth="8" strokeLinecap="round" />
    </g>
  );
}

function Arms({ pose }: { pose: MascotPose }) {
  const restLeft = <ellipse cx="36" cy="96" rx="5" ry="8" fill="url(#glowy-gold)" transform="rotate(20 36 96)" />;
  switch (pose) {
    case "point":
      return (
        <>
          {restLeft}
          <g className="glowy-point">
            <Arm d="M80 93q12 0 22-5" />
            <Hand cx={106} cy={86} />
            <path d="M111 84l8-3" stroke="#c9a24a" strokeWidth="3.4" strokeLinecap="round" />
          </g>
        </>
      );
    case "think":
      return (
        <>
          {restLeft}
          <Arm d="M80 94q8-2 2-14" />
          <Hand cx={78} cy={77} />
        </>
      );
    case "fly":
      return (
        <>
          <Arm d="M40 92q-12 0-18-8" />
          <Arm d="M80 92q12 0 18-8" />
        </>
      );
    case "relax":
      return (
        <>
          {restLeft}
          <ellipse cx="84" cy="96" rx="5" ry="8" fill="url(#glowy-gold)" transform="rotate(-20 84 96)" />
        </>
      );
    case "cheek":
      // Touches its cheek, with a sparkle (facials and skin care).
      return (
        <>
          {restLeft}
          <Arm d="M80 93q9-6 4-24" />
          <Hand cx={83} cy={68} r={6} />
          <path className="glowy-twinkle" d="M98 58l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#f3d98b" stroke="#d4af37" strokeWidth="0.8" />
        </>
      );
    case "hands":
      // Shows off its hands and nails (nail care).
      return (
        <>
          <Arm d="M40 92q-6-6-2-14" />
          <Arm d="M80 92q6-6 2-14" />
          <Hand cx={38} cy={76} />
          <Hand cx={82} cy={76} />
          <g fill="#ff7aa2">
            <ellipse cx="35" cy="71" rx="1.6" ry="2.2" />
            <ellipse cx="39" cy="70" rx="1.6" ry="2.2" />
            <ellipse cx="81" cy="70" rx="1.6" ry="2.2" />
            <ellipse cx="85" cy="71" rx="1.6" ry="2.2" />
          </g>
        </>
      );
    case "excited":
      // Both arms up (hair and makeovers).
      return (
        <>
          <Arm d="M40 90q-10-8-12-20" />
          <Arm d="M80 90q10-8 12-20" />
          <Hand cx={27} cy={67} />
          <Hand cx={93} cy={67} />
        </>
      );
    case "love":
      return (
        <>
          <Arm d="M40 92q-8-4-6-14" />
          <Arm d="M80 92q8-4 6-14" />
          <Hand cx={35} cy={77} r={6} />
          <Hand cx={85} cy={77} r={6} />
        </>
      );
    default:
      return (
        <>
          {restLeft}
          <g className="glowy-wave">
            <Arm d="M80 92q12-4 16-18" />
            <Hand cx={97} cy={70} r={7.5} />
            <path d="M93 64v-5M97 63v-6M101 64v-5" stroke="#c9a24a" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        </>
      );
  }
}

function Eyes({ pose, blink }: { pose: MascotPose; blink: boolean }) {
  if (pose === "love") {
    return (
      <path
        d="M50 58l-5-5a3 3 0 0 1 5-3a3 3 0 0 1 5 3zM70 58l-5-5a3 3 0 0 1 5-3a3 3 0 0 1 5 3z"
        fill="#ff7aa2"
        stroke="#ff7aa2"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    );
  }
  if (pose === "relax") {
    return <path d="M45 53q5 5 10 0M65 53q5 5 10 0" fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />;
  }
  if (pose === "think") {
    return (
      <g fill="#ffffff">
        <ellipse cx="52" cy="50" rx="3.4" ry="4.4" />
        <ellipse cx="72" cy="50" rx="3.4" ry="4.4" />
      </g>
    );
  }
  return (
    <g className={blink ? "glowy-blink" : undefined}>
      <path d="M45 55q5-8 10 0M65 55q5-8 10 0" fill="none" stroke="#ffffff" strokeWidth={pose === "excited" ? 4.2 : 3.6} strokeLinecap="round" />
    </g>
  );
}

export default function GlowMascot({
  size = 40,
  full = false,
  talking = false,
  pose = "wave",
  blink = false,
  flip = false,
  alive = false,
}: {
  size?: number;
  full?: boolean;
  talking?: boolean;
  pose?: MascotPose;
  blink?: boolean;
  flip?: boolean;
  alive?: boolean;
}) {
  const bigSmile = pose === "excited" || pose === "love";
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
          <stop offset="0%" stopColor="#f7e3a1" />
          <stop offset="45%" stopColor="#d9b44a" />
          <stop offset="100%" stopColor="#9c7a30" />
        </linearGradient>
        <radialGradient id="glowy-shell" cx="38%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#fbf4e6" />
          <stop offset="85%" stopColor="#ecd9b2" />
          <stop offset="100%" stopColor="#d9bf8a" />
        </radialGradient>
        <radialGradient id="glowy-visor" cx="42%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#4a3529" />
          <stop offset="60%" stopColor="#24180f" />
          <stop offset="100%" stopColor="#120b07" />
        </radialGradient>
        <radialGradient id="glowy-ear" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fbe9b0" />
          <stop offset="50%" stopColor="#d9b44a" />
          <stop offset="100%" stopColor="#8f6e27" />
        </radialGradient>
        <radialGradient id="glowy-spec" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glowy-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff8fa3" />
          <stop offset="100%" stopColor="#ff8fa3" stopOpacity="0" />
        </radialGradient>
      </defs>

      {full && (
        <g>
          {/* Body with the G emblem */}
          <g className={alive ? "glowy-breathe" : undefined}>
            <path d="M40 86q20-8 40 0l3 22q-23 9-46 0z" fill="url(#glowy-shell)" stroke="#c9a24a" strokeWidth="2.5" />
            <path d="M40 86q-4 10-3 22l6 2q-1-12 2-23z" fill="url(#glowy-gold)" />
            <path d="M80 86q4 10 3 22l-6 2q1-12-2-23z" fill="url(#glowy-gold)" />
            {/* Shadow under the head, and a soft highlight */}
            <path d="M44 88q16-5 32 0q-16 4-32 0z" fill="#a8843a" opacity="0.22" />
            <ellipse cx="50" cy="96" rx="4" ry="7" fill="url(#glowy-spec)" opacity="0.7" />
            <circle cx="60" cy="99" r="8.5" fill="url(#glowy-gold)" opacity="0.18" />
            <text x="60" y="104" textAnchor="middle" fontSize="15" fontWeight="800" fill="#c9a24a" fontFamily="system-ui, sans-serif">
              G
            </text>
          </g>
          <g transform={flip ? "translate(120 0) scale(-1 1)" : undefined}>
            <Arms pose={pose} />
          </g>
        </g>
      )}

      <g className={alive ? "glowy-head" : undefined}>
        {/* Sprout tuft */}
        <path d="M60 24c-9-5-9-15-2-21-1 6 5 7 4 13 3-2 4-5 4-8 5 6 3 13-6 16z" fill="url(#glowy-gold)" />
        <path d="M58 6c-2 4-1 9 2 12" fill="none" stroke="#fff6d8" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />

        {/* Headphones */}
        <circle cx="27" cy="54" r="10" fill="url(#glowy-ear)" stroke="#a8843a" strokeWidth="1.5" />
        <circle cx="27" cy="54" r="5.5" fill="#f3d98b" />
        <circle cx="24.5" cy="50.5" r="2.2" fill="#ffffff" opacity="0.7" />
        <circle cx="93" cy="54" r="10" fill="url(#glowy-ear)" stroke="#a8843a" strokeWidth="1.5" />
        <circle cx="93" cy="54" r="5.5" fill="#f3d98b" />
        <circle cx="90.5" cy="50.5" r="2.2" fill="#ffffff" opacity="0.7" />

        {/* Helmet with light from the top-left */}
        <ellipse cx="60" cy="53" rx="33" ry="30" fill="url(#glowy-shell)" stroke="#c9a24a" strokeWidth="3" />
        <ellipse cx="45" cy="33" rx="10" ry="5.5" fill="url(#glowy-spec)" transform="rotate(-28 45 33)" />

        {/* Glossy visor */}
        <ellipse cx="60" cy="55" rx="25" ry="20" fill="url(#glowy-visor)" />
        <ellipse cx="60" cy="55" rx="25" ry="20" fill="none" stroke="#000000" strokeOpacity="0.35" strokeWidth="1.2" />
        <path d="M40 50q3-11 16-14" fill="none" stroke="#ffffff" strokeOpacity="0.32" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="74" cy="68" rx="5" ry="2" fill="#ffffff" opacity="0.08" transform="rotate(-25 74 68)" />

        {/* Face */}
        <g className={alive && pose !== "think" ? "glowy-look" : undefined}>
          <Eyes pose={pose} blink={blink} />
        </g>
        <ellipse cx="44" cy="63" rx="5" ry="3.2" fill="url(#glowy-cheek)" />
        <ellipse cx="76" cy="63" rx="5" ry="3.2" fill="url(#glowy-cheek)" />
        <g className={talking ? "glowy-talk" : undefined}>
          {bigSmile ? (
            <>
              <path d="M52 61q8 13 16 0z" fill="#e85d6b" />
              <path d="M56 66q4-2.5 8 0q-4 3-8 0z" fill="#ff9aa6" />
            </>
          ) : (
            <>
              <path d="M54 62q6 9 12 0z" fill="#e85d6b" />
              <path d="M57 66q3-2 6 0q-3 2.5-6 0z" fill="#ff9aa6" />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}
