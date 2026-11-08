import type * as THREE from "three";

/** The GlowSync mascot as a real 3D model (three.js): pearl helmet with a
 * face screen drawn on a canvas, gold headset, leaf sprout, wings, arms with
 * hands and a star wand. Every joint moves on a spring so poses blend with a
 * little overshoot. Ported from public/mascot-3d-preview.html. */

type Three = typeof import("three");

export type Gesture = "hello" | "wave" | "teach" | "cheek" | "nails" | "cheer" | "think" | "love" | "fly" | "relax";
export type FaceKind = "happy" | "smile" | "excited" | "wink" | "surprised" | "love" | "think" | "sleepy";

export type RigState = {
  gesture: Gesture;
  face: FaceKind;
  /** -1…1: where the mouse is relative to the mascot. */
  look: { x: number; y: number };
  talking: boolean;
  /** Less idle life (e.g. while flying between cards). */
  still: boolean;
  /** Mirror it (point to the left). */
  flip: boolean;
};

export type Rig = {
  set(state: RigState): void;
  poke(kind: "hop" | "twirl"): void;
  dispose(): void;
};

type Pose = { sx: number; sz: number; ex: number; hx: number; hy: number; hz: number; curl: number };
const P = (sx: number, sz: number, ex: number, hx = 0, hy = 0, hz = 0, curl = 0): Pose => ({ sx, sz, ex, hx, hy, hz, curl });
const HIP_L = P(0.15, -0.55, -1.7, 0, 0.6, 0, -0.6);
const HIP_R = P(0.15, 0.55, -1.7, 0, -0.6, 0, -0.6);

const GESTURES: Record<Gesture, { L: Pose; R: Pose; turn: number; wand: boolean }> = {
  hello: { L: P(-0.35, -0.95, -0.5, 0, -0.4, 0.3), R: P(-0.2, 1.75, -0.85, 0, 0.2, 0), turn: 0, wand: false },
  wave: { L: P(0.05, -0.3, -0.35, 0, 1.2), R: P(-0.25, 2.25, -0.7), turn: 0, wand: false },
  teach: { L: HIP_L, R: P(-0.3, 1.45, -0.3, 0, 0, 0, -1.4), turn: 0.3, wand: true },
  cheek: { L: HIP_L, R: P(-0.35, 2.15, -0.95, 0.1, -1.5, 0.2), turn: 0.08, wand: false },
  nails: { L: P(-1.15, -0.35, -1.25, -0.2, 3.14), R: P(-1.15, 0.35, -1.25, -0.2, 3.14), turn: 0, wand: false },
  cheer: { L: P(-0.2, -2.5, -0.45), R: P(-0.2, 2.5, -0.45), turn: 0, wand: false },
  think: { L: P(-0.75, -0.15, -1.75, 0, 1.2, 0, -0.5), R: P(-1.0, 0.5, -2.35, 0.3, -1.3, 0, -0.9), turn: -0.12, wand: false },
  love: { L: P(-1.25, -0.25, -1.2, 0.2, 1.2), R: P(-1.25, 0.25, -1.2, 0.2, -1.2), turn: 0, wand: false },
  fly: { L: P(0.35, -1.25, -0.25), R: P(0.35, 1.25, -0.25), turn: 0, wand: false },
  relax: { L: HIP_L, R: HIP_R, turn: 0, wand: false },
};

// Model height (leaf tip to boots) and its middle, used to frame the camera.
const MODEL_TOP = 1.7;
const MODEL_BOTTOM = -2.7;

export function createRig(T: Three, canvas: HTMLCanvasElement, opts: { frame: number; onReady?: () => void }): Rig {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(28, 1, 0.1, 100);

  // A bright, warm studio for reflections on the pearl and gold.
  const pmrem = new T.PMREMGenerator(renderer);
  const env = new T.Scene();
  env.add(new T.Mesh(new T.BoxGeometry(12, 12, 12), new T.MeshBasicMaterial({ color: 0x4e403c, side: T.BackSide })));
  const lamp = (w: number, h: number, x: number, y: number, z: number, c: string, k: number) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  lamp(6, 6, 0, 5.9, 0, "#ffffff", 5);
  lamp(4, 4, -5.9, 1.5, 2, "#fff1dc", 4);
  lamp(4, 5, 5.9, 0.5, -1, "#ffd6ee", 3);
  lamp(5, 2, 0, 1.5, 5.9, "#ffffff", 3);
  lamp(6, 2, 0, -4, 3, "#ffe7c4", 1.6);
  const envTex = pmrem.fromScene(env, 0.035).texture;
  scene.environment = envTex;
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });

  // Physically based lights (three r155+) are about π times dimmer than the prototype's.
  scene.add(new T.HemisphereLight(0xfff8f0, 0xf1cfe0, 0.6 * Math.PI));
  const key = new T.DirectionalLight(0xffffff, 1.5 * Math.PI);
  key.position.set(-1.5, 7, 6);
  scene.add(key);
  const rim = new T.DirectionalLight(0xffc4e6, 1.2 * Math.PI);
  rim.position.set(4, 3, -4);
  scene.add(rim);

  // ── Materials ──
  const pearl = new T.MeshPhysicalMaterial({ color: 0xfaf5f1, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 });
  const gold = new T.MeshPhysicalMaterial({ color: 0xe6a21c, roughness: 0.2, metalness: 1, clearcoat: 0.5, clearcoatRoughness: 0.08, envMapIntensity: 1.1 });
  const goldPale = new T.MeshPhysicalMaterial({ color: 0xf6c84a, roughness: 0.24, metalness: 1, clearcoat: 0.4 });
  const skin = new T.MeshPhysicalMaterial({ color: 0xffc29e, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const wingMat = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15, side: T.DoubleSide });

  type V3 = [number, number, number];
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, pos?: V3 | null, scale?: V3 | null, rot?: V3 | null) => {
    const m = new T.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  };
  const group = (parent: THREE.Object3D, pos?: V3 | null, rot?: V3 | null) => {
    const g = new T.Group();
    if (pos) g.position.set(...pos);
    if (rot) g.rotation.set(...rot);
    parent.add(g);
    return g;
  };
  const extrude = (shape: THREE.Shape, depth: number, bevel: number) =>
    new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 24 });

  // ── Face screen (drawn on a canvas, shown on the visor) ──
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 1024;
  faceCanvas.height = 512;
  const fx = faceCanvas.getContext("2d")!;
  const faceTex = new T.CanvasTexture(faceCanvas);
  faceTex.colorSpace = T.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const visorMat = new T.MeshPhysicalMaterial({
    map: faceTex,
    emissiveMap: faceTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.5,
    roughness: 0.18,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.04,
    envMapIntensity: 0.18,
  });

  const CX = 256, CY = 256, K = 163; // face centre on the canvas; px per radian
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => {
    fx.beginPath();
    fx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    fx.fillStyle = fill;
    fx.fill();
  };
  const arc = (x: number, y: number, w: number, up: boolean, width = 13) => {
    fx.beginPath();
    fx.lineWidth = width;
    fx.lineCap = "round";
    fx.strokeStyle = "#ffffff";
    fx.moveTo(x - w, y);
    fx.quadraticCurveTo(x, y + (up ? -w * 1.25 : w * 0.9), x + w, y);
    fx.stroke();
  };
  const heart = (x: number, y: number, s: number) => {
    fx.beginPath();
    fx.moveTo(x, y + s * 0.9);
    fx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.3, x, y - s * 0.45);
    fx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
    fx.fillStyle = "#ff5c8d";
    fx.fill();
    ellipse(x - s * 0.55, y - s * 0.45, s * 0.22, s * 0.16, "rgba(255,255,255,.85)");
  };
  const star = (x: number, y: number, r: number) => {
    fx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.32 : r;
      fx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    fx.closePath();
    fx.fillStyle = "#f7d774";
    fx.fill();
  };
  const ovalEye = (x: number, y: number, open: number, sparkle = false, big = false) => {
    const rx = big ? 25 : 21, ry = (big ? 34 : 30) * open;
    ellipse(x, y, rx, Math.max(ry, 3), "#ffffff");
    if (open > 0.5) {
      // Purple iris and pupil (like the drawn mascot), then shines.
      ellipse(x, y + ry * 0.12, rx * 0.78, ry * 0.8, "#5b21b6");
      ellipse(x, y + ry * 0.2, rx * 0.44, ry * 0.46, "#1a0b33");
      ellipse(x, y + ry * 0.62, rx * 0.56, ry * 0.2, "rgba(201,168,255,0.7)");
      ellipse(x - rx * 0.32, y - ry * 0.32, rx * 0.34, ry * 0.28, "#ffffff");
      ellipse(x + rx * 0.3, y + ry * 0.36, 3.6, 3.6, "#ffffff");
      if (sparkle) star(x - rx * 0.3, y - ry * 0.55, 13);
    }
  };
  const mouth = (kind: "o" | "dot" | "big" | "small", x: number, y: number) => {
    if (kind === "o") {
      ellipse(x, y + 4, 12, 15, "#d42450");
      ellipse(x, y + 10, 8, 5, "#ff8fa8");
      return;
    }
    if (kind === "dot") {
      ellipse(x, y + 2, 8, 6, "#d42450");
      return;
    }
    const w = kind === "big" ? 34 : 22, h = kind === "big" ? 36 : 22;
    fx.beginPath();
    fx.moveTo(x - w, y - 6);
    fx.quadraticCurveTo(x, y - 2, x + w, y - 6);
    fx.quadraticCurveTo(x, y + h * 1.7, x - w, y - 6);
    fx.closePath();
    fx.fillStyle = "#d42450";
    fx.fill();
    fx.save();
    fx.clip();
    ellipse(x, y + h * 0.95, w * 0.62, h * 0.42, "#ff8fa8");
    fx.restore();
  };

  const face = { kind: "smile" as FaceKind, blink: 0, lookX: 0, lookY: 0, talk: 0 };
  let lastFaceKey = "";
  const drawFace = () => {
    const ex = Math.round(face.lookX * 14), ey = Math.round(face.lookY * 9);
    const keyStr = [face.kind, face.blink > 0 ? 1 : 0, ex, ey, face.talk].join("|");
    if (keyStr === lastFaceKey) return;
    lastFaceKey = keyStr;
    const g = fx.createRadialGradient(CX - 70, CY - 80, 10, CX, CY, 280);
    g.addColorStop(0, "#2f2534");
    g.addColorStop(0.55, "#110c14");
    g.addColorStop(1, "#040305");
    fx.fillStyle = g;
    fx.fillRect(0, 0, 1024, 512);

    const lx = CX - 0.31 * K + ex, rx = CX + 0.31 * K + ex, eyY = CY - 0.12 * K + ey;
    const open = face.blink > 0 ? 0.08 : 1;
    for (const cx of [CX - 0.58 * K, CX + 0.58 * K]) {
      const cy = CY + 0.12 * K;
      const cg = fx.createRadialGradient(cx, cy, 2, cx, cy, 34);
      cg.addColorStop(0, "rgba(255,92,140,1)");
      cg.addColorStop(0.6, "rgba(255,120,165,.75)");
      cg.addColorStop(1, "rgba(255,134,169,0)");
      fx.fillStyle = cg;
      fx.beginPath();
      fx.ellipse(cx, cy, 34, 23, 0, 0, Math.PI * 2);
      fx.fill();
    }
    const my = CY + 0.27 * K;
    switch (face.kind) {
      case "smile": ovalEye(lx, eyY, open); ovalEye(rx, eyY, open); mouth(face.talk ? "big" : "small", CX, my); break;
      case "excited": ovalEye(lx, eyY, open, true, true); ovalEye(rx, eyY, open, true, true); mouth("big", CX, my); break;
      case "wink": ovalEye(lx, eyY, open); arc(rx, eyY + 8, 24, true); mouth("big", CX, my); break;
      case "surprised": ovalEye(lx, eyY - 4, open, false, true); ovalEye(rx, eyY - 4, open, false, true); mouth("o", CX, my); break;
      case "love": heart(lx, eyY, 25); heart(rx, eyY, 25); mouth("big", CX, my); break;
      case "think": ovalEye(lx + 12, eyY - 14, open * 0.85); ovalEye(rx + 12, eyY - 14, open * 0.85); mouth("dot", CX + 6, my); break;
      case "sleepy": arc(lx, eyY, 22, false, 11); arc(rx, eyY, 22, false, 11); mouth("dot", CX, my); break;
      default: arc(lx, eyY + 10, 26, true); arc(rx, eyY + 10, 26, true); mouth("big", CX, my); // giggle ^ ^
    }
    faceTex.needsUpdate = true;
  };

  // ── The character ──
  // mirror: flips it to point left. root: turns and hops. upper: sways and breathes above the hips.
  const mirror = group(scene);
  const root = group(mirror);
  const upper = group(root);

  const head = group(upper, [0, 0.08, 0]);
  mesh(new T.SphereGeometry(1, 72, 56), pearl, head);

  const VC = new T.Vector3(0, -0.06, 0.48), VS = [0.84, 0.76, 0.58] as V3;
  mesh(new T.SphereGeometry(1, 96, 64), visorMat, head, [VC.x, VC.y, VC.z], VS);
  const rimPts: THREE.Vector3[] = [];
  for (let i = 0; i < 140; i++) {
    const a = (i / 140) * Math.PI * 2;
    const at = (s: number) => new T.Vector3(VC.x + VS[0] * Math.sin(s) * Math.cos(a), VC.y + VS[1] * Math.sin(s) * Math.sin(a), VC.z + VS[2] * Math.cos(s));
    let lo = 0, hi = Math.PI;
    for (let k = 0; k < 32; k++) {
      const m = (lo + hi) / 2;
      if (at(m).length() > 1) lo = m;
      else hi = m;
    }
    rimPts.push(at(hi).multiplyScalar(1.006));
  }
  mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rimPts, true), 240, 0.06, 14, true), gold, head);

  // Headset: layered cups, band over the top, little antennas with ball tips.
  const antennas: { g: THREE.Group; s: number; base: number }[] = [];
  for (const s of [-1, 1]) {
    const cup = group(head, [s * 0.97, -0.02, 0], [0, 0, Math.PI / 2]);
    mesh(new T.CylinderGeometry(0.36, 0.38, 0.26, 56), gold, cup);
    mesh(new T.TorusGeometry(0.3, 0.035, 14, 56), goldPale, cup, [0, -s * 0.14, 0], null, [Math.PI / 2, 0, 0]);
    mesh(new T.CylinderGeometry(0.22, 0.24, 0.3, 48), gold, cup);
    mesh(new T.SphereGeometry(0.22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), goldPale, cup, [0, -s * 0.15, 0], [1, 0.32, 1], [s > 0 ? Math.PI : 0, 0, 0]);
    const ant = group(head, [s * 1.0, 0.3, -0.12], [0, 0, -s * 0.18]);
    mesh(new T.CylinderGeometry(0.03, 0.035, 0.36, 12), gold, ant, [0, 0.18, 0]);
    mesh(new T.SphereGeometry(0.065, 20, 14), gold, ant, [0, 0.38, 0]);
    antennas.push({ g: ant, s, base: -s * 0.18 });
  }
  mesh(new T.TorusGeometry(1.06, 0.06, 16, 90, Math.PI), gold, head, [0, -0.02, -0.02]);

  // Leaf sprout.
  const sprout = group(head, [0, 1.04, -0.02]);
  mesh(new T.CylinderGeometry(0.11, 0.13, 0.05, 32), gold, sprout);
  mesh(new T.CylinderGeometry(0.035, 0.045, 0.2, 14), gold, sprout, [0, 0.12, 0]);
  const leafShape = new T.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.2, 0.0, 0.36, 0.14, 0.4, 0.36);
  leafShape.bezierCurveTo(0.2, 0.36, 0.04, 0.24, 0, 0);
  const leafGeo = extrude(leafShape, 0.02, 0.018);
  const veinGeo = new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(0.02, 0.02, 0.045), new T.Vector3(0.22, 0.12, 0.05), new T.Vector3(0.36, 0.32, 0.045)), 20, 0.008, 6, false);
  const leaves: { g: THREE.Group; s: number }[] = [];
  for (const s of [-1, 1]) {
    const lg = group(sprout, [0, 0.21, 0]);
    const inner = group(lg, [0, 0, -0.02], [0.15, 0, 0]);
    inner.scale.set(s, 1, 1);
    mesh(leafGeo, gold, inner);
    mesh(veinGeo, goldPale, inner);
    leaves.push({ g: lg, s });
  }

  // Body with a raised gold "G".
  const body = group(upper, [0, -1.36, 0]);
  const torso = mesh(new T.SphereGeometry(1, 56, 40), pearl, body, [0, 0, 0], [0.56, 0.56, 0.48]);
  mesh(new T.TorusGeometry(0.34, 0.055, 14, 56), gold, body, [0, 0.43, 0.01], [1, 1, 0.84], [Math.PI / 2, 0, 0]);
  mesh(new T.TorusGeometry(0.48, 0.05, 14, 64), gold, body, [0, -0.28, 0.0], [1, 1, 0.86], [Math.PI / 2, 0, 0]);
  const G = group(body, [0, 0.04, 0.455], [-0.08, 0, 0]);
  mesh(new T.TorusGeometry(0.16, 0.05, 16, 48, Math.PI * 1.62), gold, G, null, null, [0, 0, Math.PI * 0.2]);
  mesh(new T.BoxGeometry(0.15, 0.07, 0.07), gold, G, [0.09, -0.03, 0]);
  mesh(new T.BoxGeometry(0.06, 0.12, 0.07), gold, G, [0.15, -0.07, 0]);

  // Wings: pink to lavender with a gold edge.
  const wingShape = new T.Shape();
  wingShape.moveTo(0, 0.05);
  wingShape.bezierCurveTo(-0.15, 0.35, -0.5, 0.6, -0.82, 0.5);
  wingShape.bezierCurveTo(-0.9, 0.32, -0.8, 0.22, -0.68, 0.2);
  wingShape.bezierCurveTo(-0.84, 0.1, -0.78, -0.06, -0.6, -0.04);
  wingShape.bezierCurveTo(-0.7, -0.16, -0.58, -0.3, -0.4, -0.24);
  wingShape.bezierCurveTo(-0.3, -0.34, -0.12, -0.3, 0, -0.18);
  wingShape.lineTo(0, 0.05);
  const wingGeo = extrude(wingShape, 0.03, 0.02);
  // Colours are converted to linear on creation, so they can be mixed directly.
  const wingTop = new T.Color("#ffc2e6"), wingBottom = new T.Color("#a46ee8");
  const wp = wingGeo.attributes.position, wingColors: number[] = [];
  for (let i = 0; i < wp.count; i++) {
    const c = wingTop.clone().lerp(wingBottom, Math.min(1, Math.max(0, (0.55 - wp.getY(i)) / 0.85)));
    wingColors.push(c.r, c.g, c.b);
  }
  wingGeo.setAttribute("color", new T.Float32BufferAttribute(wingColors, 3));
  const wings: { g: THREE.Group; s: number }[] = [];
  for (const s of [-1, 1]) {
    const pivot = group(body, [s * 0.16, 0.3, -0.34]);
    const inner = group(pivot);
    inner.scale.set(-s * 1.3, 1.3, 1.3);
    mesh(wingGeo, wingMat, inner);
    mesh(wingGeo, gold, inner, [0.012, -0.004, 0.009], [1.06, 1.06, 0.35]);
    wings.push({ g: pivot, s });
  }

  // Legs with heart knee pads and gold-trimmed boots.
  const heartShape = new T.Shape();
  heartShape.moveTo(0, -0.09);
  heartShape.bezierCurveTo(-0.15, 0.0, -0.1, 0.12, 0, 0.05);
  heartShape.bezierCurveTo(0.1, 0.12, 0.15, 0.0, 0, -0.09);
  const heartGeo = extrude(heartShape, 0.03, 0.015);
  for (const s of [-1, 1]) {
    const leg = group(root, [s * 0.23, -1.74, 0]);
    mesh(new T.CylinderGeometry(0.16, 0.15, 0.8, 28), pearl, leg, [0, -0.32, 0]);
    mesh(heartGeo, gold, leg, [0, -0.42, 0.14], [0.85, 0.85, 0.85], [-0.15, 0, 0]);
    mesh(new T.TorusGeometry(0.16, 0.035, 12, 40), gold, leg, [0, -0.68, 0], null, [Math.PI / 2, 0, 0]);
    mesh(new T.SphereGeometry(1, 36, 24), pearl, leg, [0, -0.8, 0.06], [0.21, 0.15, 0.28]);
    mesh(new T.SphereGeometry(1, 36, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), gold, leg, [0, -0.82, 0.06], [0.215, 0.1, 0.285]);
  }

  // Arms: shoulder → elbow → wrist, with hands and fingers.
  const makeHand = (s: number) => {
    const hand = new T.Group();
    mesh(new T.SphereGeometry(1, 28, 20), skin, hand, [0, -0.1, 0], [0.12, 0.125, 0.085]);
    const fingers: THREE.Group[] = [];
    [-0.065, -0.022, 0.022, 0.065].forEach((x, i) => {
      const f = group(hand, [x, -0.19, 0], [0, 0, x * 2.4]);
      const len = i === 0 || i === 3 ? 0.075 : 0.09;
      mesh(new T.CylinderGeometry(0.03, 0.032, len, 12), skin, f, [0, -len / 2, 0]);
      mesh(new T.SphereGeometry(0.031, 12, 10), skin, f, [0, -len, 0]);
      fingers.push(f);
    });
    const thumb = group(hand, [-s * 0.1, -0.08, 0.03], [0.3, 0, -s * 0.9]);
    mesh(new T.CylinderGeometry(0.034, 0.036, 0.08, 12), skin, thumb, [0, -0.04, 0]);
    mesh(new T.SphereGeometry(0.035, 12, 10), skin, thumb, [0, -0.08, 0]);
    return { hand, fingers, thumb };
  };
  const makeArm = (s: number) => {
    const shoulder = group(body, [s * 0.5, 0.33, 0]);
    shoulder.rotation.order = "ZYX";
    mesh(new T.SphereGeometry(0.15, 24, 16), pearl, shoulder);
    mesh(new T.TorusGeometry(0.13, 0.03, 10, 32), gold, shoulder, [0, -0.06, 0], null, [Math.PI / 2, 0, 0]);
    mesh(new T.CylinderGeometry(0.125, 0.12, 0.3, 22), pearl, shoulder, [0, -0.17, 0]);
    const elbow = group(shoulder, [0, -0.32, 0]);
    mesh(new T.SphereGeometry(0.12, 20, 14), pearl, elbow);
    mesh(new T.CylinderGeometry(0.115, 0.11, 0.24, 22), pearl, elbow, [0, -0.13, 0]);
    mesh(new T.TorusGeometry(0.115, 0.03, 10, 32), gold, elbow, [0, -0.25, 0], null, [Math.PI / 2, 0, 0]);
    const wrist = group(elbow, [0, -0.27, 0]);
    const h = makeHand(s);
    wrist.add(h.hand);
    return { shoulder, elbow, wrist, ...h };
  };
  const armL = makeArm(-1), armR = makeArm(1);

  // Star wand in the right hand.
  const wand = group(armR.wrist, [0, -0.12, 0.04]);
  mesh(new T.CylinderGeometry(0.022, 0.022, 0.75, 10), gold, wand, [0, -0.3, 0]);
  const starShape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.075 : 0.18;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starMesh = mesh(extrude(starShape, 0.04, 0.02), gold, wand, [0, -0.72, -0.02]);

  // ── Springs: every joint eases with a little overshoot ──
  type Spring = { v: number; vel: number };
  const spring = (v: number): Spring => ({ v, vel: 0 });
  const step = (sp: Spring, target: number, k: number, damp: number, dt: number) => {
    const c = 2 * Math.sqrt(k) * damp;
    sp.vel += (k * (target - sp.v) - c * sp.vel) * dt;
    sp.v += sp.vel * dt;
    return sp.v;
  };
  const armSprings = () => ({ sx: spring(0), sz: spring(0), ex: spring(-0.3), hx: spring(0), hy: spring(0), hz: spring(0), curl: spring(0) });
  const SL = armSprings(), SR = armSprings();
  const turnS = spring(0), crouchS = spring(0), antS = [spring(0), spring(0)], leafS = spring(0), mirrorS = spring(1);
  const headY = spring(0), headX = spring(0);

  type Arm = ReturnType<typeof makeArm>;
  type Extra = Partial<Record<"sx" | "sz" | "ex" | "hx" | "hz", number>>;
  const poseArm = (arm: Arm, S: ReturnType<typeof armSprings>, p: Pose, dt: number, e: Extra) => {
    arm.shoulder.rotation.x = step(S.sx, p.sx + (e.sx ?? 0), 70, 0.62, dt);
    arm.shoulder.rotation.z = step(S.sz, p.sz + (e.sz ?? 0), 70, 0.62, dt);
    arm.elbow.rotation.x = step(S.ex, p.ex + (e.ex ?? 0), 55, 0.5, dt);
    arm.wrist.rotation.x = step(S.hx, p.hx + (e.hx ?? 0), 90, 0.55, dt);
    arm.wrist.rotation.y = step(S.hy, p.hy, 90, 0.6, dt);
    arm.wrist.rotation.z = step(S.hz, p.hz + (e.hz ?? 0), 90, 0.55, dt);
    const curl = step(S.curl, p.curl, 80, 0.7, dt);
    arm.fingers.forEach((f, i) => {
      f.rotation.x = curl * (1 + i * 0.05);
    });
    arm.thumb.rotation.x = 0.3 + curl * 0.6;
  };

  // ── Camera: fit the whole model in the canvas, with `frame` extra room around it ──
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const visible = (MODEL_TOP - MODEL_BOTTOM) * opts.frame;
    const mid = (MODEL_TOP + MODEL_BOTTOM) / 2;
    const dist = visible / 2 / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, mid, dist);
    camera.lookAt(0, mid, 0);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ── Loop (only while on screen and the tab is visible) ──
  let state: RigState = { gesture: "hello", face: "smile", look: { x: 0, y: 0 }, talking: false, still: false, flip: false };
  let crouch = 0, hop = 0, spin = 0, blinkAt = 2.5, prevUpperY = 0, prevTurn = 0, t = 0;
  let last = performance.now(), raf = 0, onScreen = true, ready = false, first = true;

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.max(Math.min((now - last) / 1000, 1 / 30), 1 / 240);
    last = now;
    t += dt;
    const g = GESTURES[state.gesture];
    const m = reduceMotion ? 0 : state.still ? 0.4 : 1;

    // Anticipation crouch → hop → settle.
    if (crouch > 0) {
      crouch = Math.max(0, crouch - dt);
      if (crouch === 0) hop = 1;
    }
    const crouchAmt = step(crouchS, crouch > 0 ? 1 : 0, 160, 0.7, dt);
    hop = Math.max(0, hop - dt * 2.4);
    root.position.y = Math.sin(hop * Math.PI) * 0.32 * (reduceMotion ? 0 : 1);

    const sway = Math.sin(t * 1.15) * m;
    const breathe = Math.sin(t * 2.2) * m;
    const cheer = state.gesture === "cheer" ? Math.abs(Math.sin(t * 5)) * 0.1 * m : 0;
    upper.position.set(sway * 0.035, breathe * 0.025 - crouchAmt * 0.12 + cheer, 0);
    upper.rotation.z = sway * 0.035;
    upper.scale.set(1 + crouchAmt * 0.04, 1 - crouchAmt * 0.04, 1 + crouchAmt * 0.04);
    torso.scale.set(0.56 + breathe * 0.006, 0.56 + breathe * 0.01, 0.48 + breathe * 0.006);

    const extraR: Extra = {}, extraL: Extra = { sz: sway * 0.04, ex: breathe * 0.04 };
    if (state.gesture === "wave") {
      extraR.sz = Math.sin(t * 7) * 0.22;
      extraR.ex = Math.sin(t * 7 - 0.8) * 0.35;
      extraR.hz = Math.sin(t * 7 - 1.4) * 0.4;
    } else if (state.gesture === "teach") {
      extraR.sz = Math.sin(t * 2.4) * 0.22;
      extraR.ex = Math.sin(t * 2.4 - 0.7) * 0.25;
      extraR.hx = Math.sin(t * 2.4 - 1.2) * 0.25;
    } else if (state.gesture === "hello") {
      extraR.hz = Math.sin(t * 3) * 0.25;
      extraR.ex = Math.sin(t * 3 - 0.5) * 0.12;
    } else if (state.gesture === "cheer") {
      extraR.sz = Math.sin(t * 10) * 0.12;
      extraL.sz = -Math.sin(t * 10) * 0.12;
    } else if (state.gesture === "nails") {
      extraR.hz = Math.sin(t * 2) * 0.2;
      extraL.hz = -Math.sin(t * 2) * 0.2;
    } else {
      extraR.sz = -sway * 0.04;
      extraR.ex = breathe * 0.04;
    }
    for (const k of Object.keys(extraR) as (keyof Extra)[]) extraR[k] = (extraR[k] ?? 0) * m;
    poseArm(armL, SL, g.L, dt, extraL);
    poseArm(armR, SR, g.R, dt, extraR);
    wand.visible = g.wand;
    starMesh.rotation.z = t * 1.4;

    // Head looks toward the mouse.
    const lookX = state.flip ? -state.look.x : state.look.x;
    head.rotation.y = step(headY, lookX * 0.42 + (state.gesture === "think" ? 0.15 : 0), 60, 0.8, dt);
    head.rotation.x = step(headX, state.look.y * 0.16 + (state.gesture === "think" ? -0.15 : 0), 60, 0.8, dt);
    head.rotation.z = -sway * 0.05 + (state.gesture === "think" ? 0.12 : 0) + Math.sin(t * 0.7) * 0.03 * m;

    // Turning to point the other way swings it round (mirror passes through edge-on).
    mirror.scale.x = step(mirrorS, state.flip ? -1 : 1, 90, 0.75, dt);
    spin *= Math.pow(0.25, dt);
    root.rotation.y = step(turnS, g.turn, 40, 0.8, dt) + spin;

    // Secondary motion: antennas and leaves react to movement; wings flap.
    const upperY = upper.position.y + root.position.y;
    const vy = (upperY - prevUpperY) / dt;
    const vTurn = (root.rotation.y - prevTurn) / dt;
    prevUpperY = upperY;
    prevTurn = root.rotation.y;
    antennas.forEach((a, i) => {
      const wob = step(antS[i], -vy * 0.12 + vTurn * 0.05 * a.s, 140, 0.18, dt);
      a.g.rotation.z = a.base + wob * a.s;
      a.g.rotation.x = Math.sin(t * 2 + i) * 0.04 * m;
    });
    const lw = Math.max(-0.3, Math.min(0.3, step(leafS, -vy * 0.18, 120, 0.2, dt)));
    leaves.forEach((l) => {
      l.g.rotation.z = -l.s * (0.12 + lw + Math.sin(t * 2.6) * 0.03 * m);
    });
    const fast = hop > 0 || state.gesture === "cheer" || state.gesture === "fly";
    const flap = (reduceMotion ? 0 : 1) * (fast ? Math.sin(t * 22) * 0.45 : Math.sin(t * 3.6) * 0.28 * m);
    wings.forEach((w) => {
      w.g.rotation.y = w.s * (0.3 + flap);
      w.g.rotation.z = w.s * -0.2;
    });

    // Face: expression, blinking, talking, eyes following the mouse.
    if (t > blinkAt) {
      face.blink = 0.12;
      blinkAt = t + 2.4 + Math.random() * 2.6;
    }
    face.blink = reduceMotion ? 0 : Math.max(0, face.blink - dt);
    face.kind = state.face;
    face.talk = state.talking && !reduceMotion ? Math.floor(t * 9) % 2 : 0;
    face.lookX = lookX;
    face.lookY = state.look.y;
    drawFace();

    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      opts.onReady?.();
    }
    schedule();
  };
  const schedule = () => {
    if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    last = performance.now();
    schedule();
  });
  io.observe(canvas);
  const onVisibility = () => {
    last = performance.now();
    schedule();
  };
  document.addEventListener("visibilitychange", onVisibility);
  schedule();

  return {
    set(next) {
      if (first) {
        // Start already facing the right way, in its pose (no swing on first show).
        first = false;
        mirrorS.v = next.flip ? -1 : 1;
        turnS.v = GESTURES[next.gesture].turn;
      } else if (next.gesture !== state.gesture && !reduceMotion) {
        crouch = Math.max(crouch, 0.12); // a little bob into each new pose
      }
      state = next;
    },
    poke(kind) {
      if (reduceMotion) return;
      if (kind === "hop") crouch = 0.22;
      else spin += Math.PI * 2;
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh) {
          geos.add(mm.geometry);
          mats.add(mm.material as THREE.Material);
        }
      });
      geos.forEach((x) => x.dispose());
      mats.forEach((x) => x.dispose());
      faceTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
