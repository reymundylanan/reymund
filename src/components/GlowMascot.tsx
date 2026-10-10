/** GlowSync AI's mascot — a chibi robot: big pearly-white round helmet, black
 * glossy visor face with sparkly oval eyes and pink cheeks, layered gold
 * headphones, a gold leaf sprout, a small white body with an embossed gold
 * "G", gold joints, little pink-lavender wings and little arms and legs. Shaded
 * with soft light, rim light and reflections for a 3D game-companion look.
 *
 * `full` draws the whole body (otherwise just the head). `pose` sets the arms
 * (and a default face); `face` overrides the expression; `look` (-1…1) turns
 * the eyes toward something (e.g. the mouse); `flip` mirrors the arms (to
 * gesture left); `blink` adds idle blinking; `alive` adds head tilts, looking
 * around, breathing and flapping wings; `tucked` pulls the body up into the
 * head (only the head shows) and lets it spring back out. Animations live in globals.css
 * (.glowy-*) and switch off for reduced motion. */
export type MascotPose = "wave" | "point" | "present" | "think" | "love" | "relax" | "fly" | "cheek" | "hands" | "excited";
export type MascotFace = "happy" | "excited" | "love" | "surprised" | "wink" | "giggle" | "think" | "sleepy";

// Full body: 120 × 152 units. Head only: the top part.
const FULL_BOX = { x: 0, y: -10, w: 120, h: 152 };
const HEAD_BOX = { x: 6, y: -9, w: 108, h: 100 };

const SHOULDER_L = { x: 45, y: 95 };
const SHOULDER_R = { x: 75, y: 95 };

const FACE_FOR_POSE: Record<MascotPose, MascotFace> = {
  wave: "happy",
  point: "happy",
  present: "happy",
  think: "think",
  love: "love",
  relax: "sleepy",
  fly: "excited",
  cheek: "giggle",
  hands: "excited",
  excited: "excited",
};

// ── Wings ───────────────────────────────────────────────────────────────

const WING = "M47 91C41 79 29 70 17 72C14 79 18 84 23 85C17 88 18 94 25 94C21 99 26 103 33 100C36 104 43 103 47 98Z";
const WING_FEATHERS = "M44 92Q33 82 21 78M44 94Q32 89 24 89M45 96Q36 96 29 98";

function Wing({ side, flap }: { side: -1 | 1; flap: string | undefined }) {
  const ox = side < 0 ? 47 : 73;
  return (
    <g className={flap ? `${flap}-${side < 0 ? "l" : "r"}` : undefined} style={{ transformOrigin: `${ox}px 94px`, transformBox: "view-box" }}>
      <g transform={side > 0 ? "translate(120 0) scale(-1 1)" : undefined}>
        <path d={WING} fill="url(#glowy-wing)" stroke="url(#glowy-gold)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d={WING_FEATHERS} fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M40 84Q31 78 22 77" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" />
      </g>
    </g>
  );
}

// ── Arms ────────────────────────────────────────────────────────────────

function Hand({ cx, cy, r = 6 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 1.1} fill="#cdbba0" />
      <circle cx={cx} cy={cy} r={r} fill="url(#glowy-pearl)" />
      <ellipse cx={cx + r * 0.55} cy={cy - r * 0.25} rx={r * 0.38} ry={r * 0.5} fill="url(#glowy-pearl)" stroke="#d6c6b0" strokeWidth="0.5" />
      <circle cx={cx - r * 0.35} cy={cy - r * 0.4} r={r * 0.3} fill="#ffffff" opacity="0.95" />
    </g>
  );
}

function Arm({ d }: { d: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke="#cdbba0" strokeWidth="10.5" strokeLinecap="round" />
      <path d={d} fill="none" stroke="url(#glowy-pearl-arm)" strokeWidth="8.6" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" transform="translate(-1 -1.2)" />
    </g>
  );
}

// A little gold star wand, held like a teacher's pointer.
function Wand({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x} ${y}l15 -9`} stroke="#8f6c22" strokeWidth="3.4" strokeLinecap="round" />
      <path d={`M${x} ${y}l15 -9`} stroke="url(#glowy-gold)" strokeWidth="2.4" strokeLinecap="round" />
      <g className="glowy-twinkle">
        <path
          d={`M${x + 17} ${y - 16.5}l2.1 4.6 5 0.6-3.7 3.4 1 5-4.4-2.5-4.4 2.5 1-5-3.7-3.4 5-0.6z`}
          fill="url(#glowy-gold)"
          stroke="#9a7428"
          strokeWidth="0.6"
        />
        <circle cx={x + 16} cy={y - 12} r="1" fill="#ffffff" />
      </g>
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
      return (
        <>
          {restL}
          <Arm d={`M${rx} ${ry}q11 -8 9 -26`} />
          <Hand cx={rx + 8} cy={ry - 28} />
          <path className="glowy-twinkle" d="M100 52l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8z" fill="url(#glowy-gold)" stroke="#b8902f" strokeWidth="0.6" />
        </>
      );
    case "hands":
      return (
        <>
          <Arm d={`M${lx} ${ly}q-9 -2 -9 -13`} />
          <Arm d={`M${rx} ${ry}q9 -2 9 -13`} />
          <Hand cx={lx - 9} cy={ly - 15} />
          <Hand cx={rx + 9} cy={ry - 15} />
          <g fill="#ff6f9a" stroke="#ffffff" strokeWidth="0.4">
            <ellipse cx={lx - 12} cy={ly - 20} rx="1.5" ry="2.1" />
            <ellipse cx={lx - 8} cy={ly - 21} rx="1.5" ry="2.1" />
            <ellipse cx={rx + 8} cy={ry - 21} rx="1.5" ry="2.1" />
            <ellipse cx={rx + 12} cy={ry - 20} rx="1.5" ry="2.1" />
          </g>
        </>
      );
    case "excited":
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

// ── Face ────────────────────────────────────────────────────────────────

function OvalEye({ cx, cy, sparkle }: { cx: number; cy: number; sparkle?: boolean }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="5.3" ry="7.6" fill="#ffffff" />
      <ellipse cx={cx} cy={cy + 3.2} rx="4.2" ry="3" fill="#e6e0ff" opacity="0.55" />
      <ellipse cx={cx - 1.6} cy={cy - 3} rx="1.7" ry="2.2" fill="#ffffff" />
      <circle cx={cx + 1.7} cy={cy + 2.4} r="0.9" fill="#ffffff" />
      {sparkle && (
        <path
          className="glowy-twinkle"
          d={`M${cx} ${cy - 3.6}l1.1 2.5 2.5 1.1-2.5 1.1-1.1 2.5-1.1-2.5-2.5-1.1 2.5-1.1z`}
          fill="#f7d774"
        />
      )}
    </g>
  );
}

function Face({ face, blink, look, idleLook, talking }: { face: MascotFace; blink: boolean; look?: { x: number; y: number }; idleLook: boolean; talking: boolean }) {
  const lookT = look ? `translate(${(look.x * 2.6).toFixed(2)} ${(look.y * 2).toFixed(2)})` : undefined;
  const closedArc = (cx: number) => `M${cx - 5} 51q5 -6 10 0`;
  let eyes;
  switch (face) {
    case "love":
      eyes = (
        <g className="glowy-pulse" style={{ transformOrigin: "60px 52px", transformBox: "view-box" }}>
          <path d="M48.5 57l-6-6a3.6 3.6 0 0 1 6-3.7a3.6 3.6 0 0 1 6 3.7zM71.5 57l-6-6a3.6 3.6 0 0 1 6-3.7a3.6 3.6 0 0 1 6 3.7z" fill="#ff5c8d" />
          <circle cx="46" cy="49.5" r="1" fill="#ffffff" />
          <circle cx="69" cy="49.5" r="1" fill="#ffffff" />
        </g>
      );
      break;
    case "sleepy":
      eyes = <path d="M43.5 51q5 5 10 0M66.5 51q5 5 10 0" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />;
      break;
    case "giggle":
      eyes = <path d={`${closedArc(48.5)}${closedArc(71.5)}`} fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" />;
      break;
    case "wink":
      eyes = (
        <>
          <OvalEye cx={48.5} cy={50} />
          <path d={closedArc(71.5)} fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" />
        </>
      );
      break;
    case "surprised":
      eyes = (
        <>
          <ellipse cx="48.5" cy="49" rx="6.2" ry="8.4" fill="#ffffff" />
          <ellipse cx="71.5" cy="49" rx="6.2" ry="8.4" fill="#ffffff" />
          <circle cx="46.5" cy="45.5" r="2" fill="#ffffff" stroke="#e6e0ff" strokeWidth="0.6" />
          <circle cx="69.5" cy="45.5" r="2" fill="#ffffff" stroke="#e6e0ff" strokeWidth="0.6" />
        </>
      );
      break;
    case "think":
      eyes = (
        <>
          <ellipse cx="50" cy="46" rx="4.4" ry="6" fill="#ffffff" />
          <ellipse cx="73" cy="46" rx="4.4" ry="6" fill="#ffffff" />
          <circle cx="49" cy="43.5" r="1.3" fill="#e6e0ff" />
          <circle cx="72" cy="43.5" r="1.3" fill="#e6e0ff" />
        </>
      );
      break;
    default:
      eyes = (
        <>
          <OvalEye cx={48.5} cy={50} sparkle={face === "excited"} />
          <OvalEye cx={71.5} cy={50} sparkle={face === "excited"} />
        </>
      );
  }

  let mouth;
  if (face === "surprised") {
    mouth = (
      <>
        <ellipse cx="60" cy="65" rx="3.4" ry="4" fill="#c92442" />
        <ellipse cx="60" cy="66.8" rx="2.2" ry="1.6" fill="#ff8fa3" />
      </>
    );
  } else if (face === "think") {
    mouth = <ellipse cx="60" cy="65" rx="2.4" ry="1.7" fill="#c92442" />;
  } else if (face === "sleepy") {
    mouth = <path d="M56 63q4 3.5 8 0z" fill="#e0344f" />;
  } else if (face === "excited" || face === "giggle" || face === "love") {
    mouth = (
      <>
        <path d="M52.5 60.5q7.5 13 15 0z" fill="#c92442" />
        <path d="M55.5 66q4.5-3.4 9 0q-4.5 3.6-9 0z" fill="#ff8fa3" />
        <path d="M54 61q6 1.4 12 0" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.2" strokeLinecap="round" />
      </>
    );
  } else {
    mouth = (
      <>
        <path d="M54.5 61.5q5.5 8 11 0z" fill="#c92442" />
        <path d="M57 65.2q3-1.8 6 0q-3 2.2-6 0z" fill="#ff8fa3" />
      </>
    );
  }

  const openEyes = face === "happy" || face === "excited";
  return (
    <>
      <g transform={lookT}>
        <g className={!look && idleLook && openEyes ? "glowy-look" : undefined}>
          <g className={blink && openEyes ? "glowy-blink" : undefined}>{eyes}</g>
        </g>
      </g>
      <ellipse cx="39.5" cy="61" rx="5.6" ry="3.6" fill="url(#glowy-cheek)" />
      <ellipse cx="80.5" cy="61" rx="5.6" ry="3.6" fill="url(#glowy-cheek)" />
      <g className={talking ? "glowy-talk" : undefined}>{mouth}</g>
    </>
  );
}

// ── Character ───────────────────────────────────────────────────────────

export default function GlowMascot({
  size = 40,
  full = false,
  talking = false,
  pose = "wave",
  face,
  look,
  blink = false,
  flip = false,
  alive = false,
  tucked = false,
}: {
  size?: number;
  full?: boolean;
  talking?: boolean;
  pose?: MascotPose;
  face?: MascotFace;
  look?: { x: number; y: number };
  blink?: boolean;
  flip?: boolean;
  alive?: boolean;
  tucked?: boolean;
}) {
  // Tucking shrinks everything below the head up into it, then springs back.
  const tuck = {
    transformOrigin: "60px 84px",
    transformBox: "view-box" as const,
    transform: tucked ? "translateY(-12px) scale(0.15)" : "none",
    opacity: tucked ? 0 : 1,
    transition: tucked
      ? "transform 200ms cubic-bezier(0.6, 0, 0.9, 0.4), opacity 160ms ease-in 60ms"
      : "transform 520ms cubic-bezier(0.3, 1.6, 0.5, 1), opacity 120ms ease-out",
  };
  const box = full ? FULL_BOX : HEAD_BOX;
  // `size` is the height; the width follows the drawing's shape.
  const width = Math.round((size * box.w) / box.h);
  return (
    <svg width={width} height={size} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} aria-hidden className="block overflow-visible">
      <defs>
        <linearGradient id="glowy-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1bd" />
          <stop offset="35%" stopColor="#e9c35a" />
          <stop offset="70%" stopColor="#c39433" />
          <stop offset="100%" stopColor="#8a6620" />
        </linearGradient>
        <radialGradient id="glowy-pearl" cx="34%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#f7f2ee" />
          <stop offset="78%" stopColor="#e6dcd6" />
          <stop offset="100%" stopColor="#c9bab4" />
        </radialGradient>
        <radialGradient id="glowy-ao" cx="40%" cy="30%" r="72%">
          <stop offset="70%" stopColor="#8f7466" stopOpacity="0" />
          <stop offset="100%" stopColor="#8f7466" stopOpacity="0.32" />
        </radialGradient>
        <radialGradient id="glowy-iri" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f4c3e7" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f4c3e7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="glowy-pearl-arm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2d7cf" />
        </linearGradient>
        <radialGradient id="glowy-visor" cx="38%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#332838" />
          <stop offset="55%" stopColor="#140f17" />
          <stop offset="100%" stopColor="#040305" />
        </radialGradient>
        <radialGradient id="glowy-ear" cx="32%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#fff4c8" />
          <stop offset="40%" stopColor="#e6bd52" />
          <stop offset="80%" stopColor="#b48526" />
          <stop offset="100%" stopColor="#7c5a1b" />
        </radialGradient>
        <radialGradient id="glowy-spec" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glowy-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff5f8f" />
          <stop offset="60%" stopColor="#ff86a9" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ff86a9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="glowy-wing" x1="0.2" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffe3f4" />
          <stop offset="45%" stopColor="#f3a9de" />
          <stop offset="100%" stopColor="#b98af0" />
        </linearGradient>
        <linearGradient id="glowy-leg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#ece4dd" />
          <stop offset="100%" stopColor="#cdbdb4" />
        </linearGradient>
      </defs>

      {full && (
        <g style={tuck}>
          {/* Little wings behind the body: a gentle flap, faster while flying */}
          {[-1, 1].map((side) => (
            <Wing key={side} side={side as -1 | 1} flap={pose === "fly" ? "glowy-flap-fast" : alive ? "glowy-flap" : undefined} />
          ))}

          {/* Legs with gold ankle bands and feet */}
          {[52.5, 67.5].map((x) => (
            <g key={x}>
              <rect x={x - 5.5} y="111" width="11" height="19" rx="5.5" fill="url(#glowy-leg)" stroke="#cdbba0" strokeWidth="0.9" />
              <ellipse cx={x} cy="119" rx="4" ry="2" fill="#bfae9f" opacity="0.25" />
              <rect x={x - 5.6} y="125.5" width="11.2" height="2.4" rx="1.2" fill="url(#glowy-gold)" />
              <ellipse cx={x + (x < 60 ? -0.5 : 0.5)} cy="132.5" rx="7.6" ry="4.6" fill="url(#glowy-pearl)" stroke="#cdbba0" strokeWidth="0.9" />
              <path d={`M${x - 6.5} 134q6.5 3 13 0`} fill="none" stroke="#b9a593" strokeOpacity="0.55" strokeWidth="1.2" />
              <ellipse cx={x - 2.5} cy="130.8" rx="2.4" ry="1.2" fill="#ffffff" opacity="0.9" />
            </g>
          ))}

          {/* Body with an embossed gold G */}
          <g className={alive ? "glowy-breathe" : undefined}>
            <path d="M43 90q17-7 34 0q5 12 2 25q-19 6 -38 0q-3 -13 2 -25z" fill="url(#glowy-pearl)" stroke="#cdbba0" strokeWidth="1.1" />
            <path d="M43 90q17-7 34 0q5 12 2 25q-19 6 -38 0q-3 -13 2 -25z" fill="url(#glowy-ao)" />
            <path d="M45.5 91q14.5-4.6 29 0" fill="none" stroke="#8f6c22" strokeWidth="3" strokeLinecap="round" />
            <path d="M45.5 91q14.5-4.6 29 0" fill="none" stroke="url(#glowy-gold)" strokeWidth="2.2" strokeLinecap="round" />
            <ellipse cx="49" cy="101" rx="3.4" ry="6.4" fill="url(#glowy-spec)" opacity="0.9" />
            <circle cx="60" cy="105" r="8.6" fill="#f4ead8" stroke="#e1cfa8" strokeWidth="0.6" />
            <text x="60.4" y="110.6" textAnchor="middle" fontSize="14.5" fontWeight="900" fill="#8f6c22" fontFamily="system-ui, sans-serif">G</text>
            <text x="60" y="110" textAnchor="middle" fontSize="14.5" fontWeight="900" fill="url(#glowy-gold)" fontFamily="system-ui, sans-serif">G</text>
            {/* Gold shoulder joints */}
            <circle cx="44.5" cy="95" r="3.4" fill="url(#glowy-ear)" stroke="#8f6c22" strokeWidth="0.5" />
            <circle cx="75.5" cy="95" r="3.4" fill="url(#glowy-ear)" stroke="#8f6c22" strokeWidth="0.5" />
          </g>
        </g>
      )}

      <g className={alive ? "glowy-head" : undefined}>
        {/* Gold leaf sprout with veins */}
        <path d="M60 15q-1-4 0-8" fill="none" stroke="#8f6c22" strokeWidth="3" strokeLinecap="round" />
        <path d="M60 15q-1-4 0-8" fill="none" stroke="url(#glowy-gold)" strokeWidth="2" strokeLinecap="round" />
        <path d="M60 8C56 2 48 0 42.5 2C45.5 8.5 53.5 11 60 8z" fill="url(#glowy-gold)" stroke="#9a7428" strokeWidth="0.5" />
        <path d="M60 8C64 2 72 0 77.5 2C74.5 8.5 66.5 11 60 8z" fill="url(#glowy-gold)" stroke="#9a7428" strokeWidth="0.5" />
        <path d="M59 7.4Q52 4.6 44.5 2.8M61 7.4Q68 4.6 75.5 2.8" fill="none" stroke="#9a7428" strokeWidth="0.7" strokeLinecap="round" />
        <path d="M49 3.2q3-0.6 6 0.4M65 3.6q3-1 6-0.4" fill="none" stroke="#fff6d6" strokeWidth="0.9" strokeLinecap="round" opacity="0.9" />

        {/* Headphone band */}
        <path d="M21 46q4-35 39-35q35 0 39 35" fill="none" stroke="#8f6c22" strokeWidth="4" strokeLinecap="round" opacity="0.75" />
        <path d="M21 46q4-35 39-35q35 0 39 35" fill="none" stroke="url(#glowy-gold)" strokeWidth="2.8" strokeLinecap="round" />

        {/* Pearly round helmet: base, shadow, pink sheen, rim light, highlights */}
        <ellipse cx="60" cy="50" rx="39" ry="37" fill="url(#glowy-pearl)" />
        <ellipse cx="60" cy="50" rx="39" ry="37" fill="url(#glowy-ao)" />
        <ellipse cx="62" cy="78" rx="26" ry="8" fill="url(#glowy-iri)" />
        <ellipse cx="60" cy="50" rx="39" ry="37" fill="none" stroke="#cbb9ae" strokeWidth="1" />
        <path d="M91 30q9 14 5 34" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx="42" cy="25" rx="13" ry="7" fill="url(#glowy-spec)" transform="rotate(-30 42 25)" />
        <ellipse cx="37.5" cy="22" rx="3.6" ry="1.9" fill="#ffffff" transform="rotate(-30 37.5 22)" />

        {/* Layered gold headphones */}
        {[20, 100].map((cx) => {
          const inward = cx < 60 ? 1.5 : -1.5;
          return (
            <g key={cx}>
              <ellipse cx={cx} cy="52" rx="10" ry="14" fill="url(#glowy-ear)" stroke="#7c5a1b" strokeWidth="0.9" />
              <ellipse cx={cx + inward} cy="52" rx="7" ry="10.4" fill="none" stroke="#fff1c2" strokeOpacity="0.75" strokeWidth="1.1" />
              <ellipse cx={cx + inward} cy="52" rx="5" ry="8" fill="url(#glowy-gold)" stroke="#9a7428" strokeWidth="0.6" />
              <ellipse cx={cx + inward} cy="52" rx="2.2" ry="4" fill="#b48526" />
              <ellipse cx={cx - 3} cy="44" rx="2.1" ry="3.6" fill="#ffffff" opacity="0.85" />
            </g>
          );
        })}

        {/* Black glossy visor with a two-tone gold rim */}
        <path d="M60 28c20 0 30 9 30 24c0 15-12 26-30 26s-30-11-30-26c0-15 10-24 30-24z" fill="url(#glowy-visor)" stroke="#8a6620" strokeWidth="3.4" />
        <path d="M60 28c20 0 30 9 30 24c0 15-12 26-30 26s-30-11-30-26c0-15 10-24 30-24z" fill="none" stroke="url(#glowy-gold)" strokeWidth="1.9" />
        <path d="M60 30.5c18 0 27.5 8 27.5 21.5" fill="none" stroke="#6b4d8f" strokeOpacity="0.45" strokeWidth="1.2" />
        <path d="M35 47q2.5-14 21-16.5q-15 5.5-18.5 18z" fill="#ffffff" opacity="0.2" />
        <circle cx="81" cy="36" r="1.1" fill="#ffffff" opacity="0.7" />
        <circle cx="84.5" cy="40" r="0.6" fill="#ffffff" opacity="0.6" />
        <ellipse cx="72" cy="73" rx="9" ry="1.8" fill="#ffffff" opacity="0.07" />

        <Face face={face ?? FACE_FOR_POSE[pose]} blink={blink} look={look} idleLook={alive} talking={talking} />
      </g>

      {full && (
        <g style={tuck}>
          <g transform={flip ? "translate(120 0) scale(-1 1)" : undefined}>
            <Arms pose={pose} />
          </g>
        </g>
      )}
    </svg>
  );
}
