/** GlowSync AI's mascot — a chibi robot: big pearly-white round helmet, black
 * glossy visor face with oval eyes and pink cheeks, gold headphones, a gold
 * leaf sprout, a small white body with a gold "G", a pink-lavender cape and
 * little arms and legs. Shaded with soft light and highlights for a 3D look.
 *
 * `full` draws the whole body (otherwise just the head). `pose` changes the
 * arms and face; `flip` mirrors the arms (to gesture to the left); `blink`
 * adds idle blinking; `alive` adds head tilts, looking around, breathing and
 * a fluttering cape. Animations live in globals.css (.glowy-*) and switch off
 * for reduced motion. */
export type MascotPose = "wave" | "point" | "present" | "think" | "love" | "relax" | "fly" | "cheek" | "hands" | "excited";

// Full body: 120 × 152 units. Head only: the top part.
const FULL_BOX = { x: 0, y: -10, w: 120, h: 152 };
const HEAD_BOX = { x: 6, y: -9, w: 108, h: 100 };

const SHOULDER_L = { x: 45, y: 95 };
const SHOULDER_R = { x: 75, y: 95 };

function Hand({ cx, cy, r = 6 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 1.2} fill="#d8c7a6" />
      <circle cx={cx} cy={cy} r={r} fill="url(#glowy-pearl)" />
      <circle cx={cx - r * 0.35} cy={cy - r * 0.4} r={r * 0.32} fill="#ffffff" opacity="0.9" />
    </g>
  );
}

function Arm({ d }: { d: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke="#d8c7a6" strokeWidth="10.5" strokeLinecap="round" />
      <path d={d} fill="none" stroke="url(#glowy-pearl-arm)" strokeWidth="8.5" strokeLinecap="round" />
    </g>
  );
}

// A little gold star wand, held like a teacher's pointer.
function Wand({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x} ${y}l15 -9`} stroke="url(#glowy-gold)" strokeWidth="2.6" strokeLinecap="round" />
      <path
        className="glowy-twinkle"
        d={`M${x + 17} ${y - 16}l1.9 4.4 4.6 0.6-3.4 3.2 0.9 4.6-4-2.3-4 2.3 0.9-4.6-3.4-3.2 4.6-0.6z`}
        fill="url(#glowy-gold)"
        stroke="#b8902f"
        strokeWidth="0.6"
      />
    </g>
  );
}

function Arms({ pose }: { pose: MascotPose }) {
  const { x: lx, y: ly } = SHOULDER_L;
  const { x: rx, y: ry } = SHOULDER_R;
  const restL = (
    <>
      <Arm d={`M${lx} ${ly}q-7 8 -6 17`} />
      <Hand cx={lx - 6} cy={ly + 18} />
    </>
  );
  const restR = (
    <>
      <Arm d={`M${rx} ${ry}q7 8 6 17`} />
      <Hand cx={rx + 6} cy={ry + 18} />
    </>
  );
  // Rotates around the right shoulder (see .glowy-teach / .glowy-wave in globals.css).
  const shoulder = { transformOrigin: `${rx}px ${ry}px`, transformBox: "view-box" as const };

  switch (pose) {
    case "present":
    case "point":
      // Teacher gesture: arm out with the star wand, sweeping gently.
      return (
        <>
          {restL}
          <g className="glowy-teach" style={shoulder}>
            <Arm d={`M${rx} ${ry}q13 -2 22 -11`} />
            <Wand x={rx + 23} y={ry - 12} />
            <Hand cx={rx + 23} cy={ry - 12} />
          </g>
        </>
      );
    case "think":
      return (
        <>
          {restL}
          <Arm d={`M${rx} ${ry}q6 -4 -1 -13`} />
          <Hand cx={rx - 2} cy={ry - 15} />
        </>
      );
    case "fly":
      return (
        <>
          <Arm d={`M${lx} ${ly}q-12 0 -18 -6`} />
          <Hand cx={lx - 19} cy={ly - 7} />
          <Arm d={`M${rx} ${ry}q12 0 18 -6`} />
          <Hand cx={rx + 19} cy={ry - 7} />
        </>
      );
    case "relax":
      return (
        <>
          {restL}
          {restR}
        </>
      );
    case "cheek":
      // Touches its cheek, with a sparkle (facials and skin care).
      return (
        <>
          {restL}
          <Arm d={`M${rx} ${ry}q11 -8 9 -26`} />
          <Hand cx={rx + 8} cy={ry - 28} />
          <path className="glowy-twinkle" d="M100 52l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8z" fill="#f3d98b" stroke="#d4af37" strokeWidth="0.7" />
        </>
      );
    case "hands":
      // Shows off its hands and nails (nail care).
      return (
        <>
          <Arm d={`M${lx} ${ly}q-9 -2 -9 -13`} />
          <Arm d={`M${rx} ${ry}q9 -2 9 -13`} />
          <Hand cx={lx - 9} cy={ly - 15} />
          <Hand cx={rx + 9} cy={ry - 15} />
          <g fill="#ff7aa2">
            <ellipse cx={lx - 12} cy={ly - 20} rx="1.5" ry="2.1" />
            <ellipse cx={lx - 8} cy={ly - 21} rx="1.5" ry="2.1" />
            <ellipse cx={rx + 8} cy={ry - 21} rx="1.5" ry="2.1" />
            <ellipse cx={rx + 12} cy={ry - 20} rx="1.5" ry="2.1" />
          </g>
        </>
      );
    case "excited":
      // Both arms up (hair, lashes and makeovers).
      return (
        <g className="glowy-cheer">
          <Arm d={`M${lx} ${ly}q-16 -4 -20 -22`} />
          <Arm d={`M${rx} ${ry}q16 -4 20 -22`} />
          <Hand cx={lx - 20} cy={ly - 24} />
          <Hand cx={rx + 20} cy={ry - 24} />
        </g>
      );
    case "love":
      return (
        <>
          <Arm d={`M${lx} ${ly}q-9 -4 -8 -16`} />
          <Arm d={`M${rx} ${ry}q9 -4 8 -16`} />
          <Hand cx={lx - 8} cy={ly - 18} />
          <Hand cx={rx + 8} cy={ry - 18} />
        </>
      );
    default:
      return (
        <>
          {restL}
          <g className="glowy-wave" style={shoulder}>
            <Arm d={`M${rx} ${ry}q14 -1 20 -13`} />
            <Hand cx={rx + 21} cy={ry - 15} r={6.5} />
          </g>
        </>
      );
  }
}

function Face({ pose, blink, alive, talking }: { pose: MascotPose; blink: boolean; alive: boolean; talking: boolean }) {
  const bigSmile = pose === "excited" || pose === "love" || pose === "wave";
  let eyes;
  if (pose === "love") {
    eyes = (
      <path
        d="M49 56l-5.5-5.5a3.3 3.3 0 0 1 5.5-3.4a3.3 3.3 0 0 1 5.5 3.4zM71 56l-5.5-5.5a3.3 3.3 0 0 1 5.5-3.4a3.3 3.3 0 0 1 5.5 3.4z"
        fill="#ff7aa2"
      />
    );
  } else if (pose === "relax") {
    eyes = <path d="M44 51q5 5 10 0M66 51q5 5 10 0" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />;
  } else {
    const up = pose === "think" ? -3 : 0;
    eyes = (
      <g className={blink ? "glowy-blink" : undefined}>
        <ellipse cx="48.5" cy={50 + up} rx="5.2" ry="7.6" fill="#ffffff" />
        <ellipse cx="71.5" cy={50 + up} rx="5.2" ry="7.6" fill="#ffffff" />
        <circle cx="47" cy={47 + up} r="1.6" fill="#e9e4ff" />
        <circle cx="70" cy={47 + up} r="1.6" fill="#e9e4ff" />
      </g>
    );
  }
  return (
    <>
      <g className={alive && pose !== "think" ? "glowy-look" : undefined}>{eyes}</g>
      <ellipse cx="40.5" cy="61" rx="5" ry="3.3" fill="url(#glowy-cheek)" />
      <ellipse cx="79.5" cy="61" rx="5" ry="3.3" fill="url(#glowy-cheek)" />
      <g className={talking ? "glowy-talk" : undefined}>
        {bigSmile ? (
          <>
            <path d="M53 61q7 12 14 0z" fill="#e0344f" />
            <path d="M56 66q4-3 8 0q-4 3.2-8 0z" fill="#ff8fa3" />
          </>
        ) : pose === "think" ? (
          <ellipse cx="60" cy="64" rx="2.6" ry="2" fill="#e0344f" />
        ) : (
          <>
            <path d="M55 62q5 7 10 0z" fill="#e0344f" />
            <path d="M57.5 65.2q2.5-1.6 5 0q-2.5 2-5 0z" fill="#ff8fa3" />
          </>
        )}
      </g>
    </>
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
  const box = full ? FULL_BOX : HEAD_BOX;
  // `size` is the height; the width follows the drawing's shape.
  const width = Math.round((size * box.w) / box.h);
  return (
    <svg
      width={width}
      height={size}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      aria-hidden
      className="block overflow-visible"
    >
      <defs>
        <linearGradient id="glowy-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbe7a6" />
          <stop offset="45%" stopColor="#dcb247" />
          <stop offset="100%" stopColor="#9a7428" />
        </linearGradient>
        <radialGradient id="glowy-pearl" cx="36%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#f6f1ec" />
          <stop offset="82%" stopColor="#e4d9cf" />
          <stop offset="100%" stopColor="#cdbfb2" />
        </radialGradient>
        <linearGradient id="glowy-pearl-arm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e9e0d6" />
        </linearGradient>
        <radialGradient id="glowy-visor" cx="40%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#2c2430" />
          <stop offset="60%" stopColor="#120e14" />
          <stop offset="100%" stopColor="#050406" />
        </radialGradient>
        <radialGradient id="glowy-ear" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff0bf" />
          <stop offset="45%" stopColor="#dcb247" />
          <stop offset="100%" stopColor="#8a6824" />
        </radialGradient>
        <radialGradient id="glowy-spec" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glowy-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6f9a" />
          <stop offset="70%" stopColor="#ff8fb0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ff8fb0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="glowy-cape" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9a6e0" />
          <stop offset="55%" stopColor="#c77fd6" />
          <stop offset="100%" stopColor="#a463c4" />
        </linearGradient>
      </defs>

      {full && (
        <g>
          {/* Cape behind the body */}
          <g className={alive ? "glowy-cape" : undefined} style={{ transformOrigin: "60px 90px", transformBox: "view-box" }}>
            <path d="M42 90q-12 18 -16 36q8 6 14 1q6 6 12 0q8 6 16 0q6 6 12 0q6 5 14 -1q-4 -18 -16 -36z" fill="url(#glowy-cape)" />
            <path d="M44 92q-8 14 -12 30" fill="none" stroke="#f6d3f0" strokeWidth="1.6" opacity="0.6" strokeLinecap="round" />
          </g>

          {/* Legs */}
          <g>
            <rect x="47" y="112" width="11" height="18" rx="5.5" fill="url(#glowy-pearl)" stroke="#d8c7a6" strokeWidth="1" />
            <rect x="62" y="112" width="11" height="18" rx="5.5" fill="url(#glowy-pearl)" stroke="#d8c7a6" strokeWidth="1" />
            <ellipse cx="52" cy="132" rx="7.5" ry="4.6" fill="url(#glowy-pearl)" stroke="#d8c7a6" strokeWidth="1" />
            <ellipse cx="68" cy="132" rx="7.5" ry="4.6" fill="url(#glowy-pearl)" stroke="#d8c7a6" strokeWidth="1" />
          </g>

          {/* Body with the gold G */}
          <g className={alive ? "glowy-breathe" : undefined}>
            <path d="M43 90q17-7 34 0q5 12 2 25q-19 6 -38 0q-3 -13 2 -25z" fill="url(#glowy-pearl)" stroke="#d8c7a6" strokeWidth="1.2" />
            <path d="M46 91q14-4 28 0" fill="none" stroke="url(#glowy-gold)" strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="49" cy="101" rx="3.5" ry="6" fill="url(#glowy-spec)" opacity="0.8" />
            <text x="60" y="110" textAnchor="middle" fontSize="15" fontWeight="900" fill="url(#glowy-gold)" fontFamily="system-ui, sans-serif">
              G
            </text>
          </g>

        </g>
      )}

      <g className={alive ? "glowy-head" : undefined}>
        {/* Gold leaf sprout */}
        <path d="M60 15v-8" stroke="url(#glowy-gold)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M60 8c-3-6-10-8-15-6 2 6 9 9 15 6z" fill="url(#glowy-gold)" />
        <path d="M60 8c3-6 10-8 15-6-2 6-9 9-15 6z" fill="url(#glowy-gold)" />
        <path d="M58 6c-3-2-7-3-10-2M62 6c3-2 7-3 10-2" stroke="#fff3c9" strokeWidth="0.9" strokeLinecap="round" opacity="0.8" />

        {/* Headphone band */}
        <path d="M22 46q4-34 38-34q34 0 38 34" fill="none" stroke="url(#glowy-gold)" strokeWidth="3" strokeLinecap="round" opacity="0.9" />

        {/* Pearly round helmet */}
        <ellipse cx="60" cy="50" rx="39" ry="37" fill="url(#glowy-pearl)" stroke="#d6c6b4" strokeWidth="1.2" />
        <ellipse cx="42" cy="26" rx="12" ry="6.5" fill="url(#glowy-spec)" transform="rotate(-30 42 26)" />

        {/* Gold headphones */}
        <ellipse cx="20" cy="52" rx="9" ry="13" fill="url(#glowy-ear)" stroke="#9a7428" strokeWidth="1" />
        <ellipse cx="21.5" cy="52" rx="4.5" ry="8" fill="#f7dc8a" opacity="0.9" />
        <ellipse cx="17" cy="45" rx="2" ry="3.2" fill="#ffffff" opacity="0.75" />
        <ellipse cx="100" cy="52" rx="9" ry="13" fill="url(#glowy-ear)" stroke="#9a7428" strokeWidth="1" />
        <ellipse cx="98.5" cy="52" rx="4.5" ry="8" fill="#f7dc8a" opacity="0.9" />
        <ellipse cx="97" cy="45" rx="2" ry="3.2" fill="#ffffff" opacity="0.75" />

        {/* Black glossy visor with a gold rim */}
        <path d="M60 28c20 0 30 9 30 24c0 15-12 26-30 26s-30-11-30-26c0-15 10-24 30-24z" fill="url(#glowy-visor)" stroke="url(#glowy-gold)" strokeWidth="2.4" />
        <path d="M37 45q4-12 18-14" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="2.6" strokeLinecap="round" />
        <ellipse cx="78" cy="71" rx="5" ry="1.8" fill="#ffffff" opacity="0.07" transform="rotate(-25 78 71)" />

        <Face pose={pose} blink={blink} alive={alive} talking={talking} />
      </g>

      {full && (
        <g transform={flip ? "translate(120 0) scale(-1 1)" : undefined}>
          <Arms pose={pose} />
        </g>
      )}
    </svg>
  );
}
