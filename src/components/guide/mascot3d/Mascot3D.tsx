"use client";

import { useEffect, useRef, useState } from "react";
import GlowMascot, { type MascotFace, type MascotPose } from "@/components/GlowMascot";
import { mascotWidth } from "@/components/guide/guideKit";
import type { FaceKind, Gesture, Rig } from "./rig";

/** The GlowSync mascot in real 3D (three.js), with the same props as the
 * drawn one. The drawn mascot shows at once and stays if WebGL isn't
 * available; three.js only loads when this is on the page. */

const GESTURE_FOR_POSE: Record<MascotPose, Gesture> = {
  wave: "wave",
  point: "teach",
  present: "teach",
  think: "think",
  love: "love",
  relax: "relax",
  fly: "fly",
  cheek: "cheek",
  hands: "nails",
  excited: "cheer",
};

const FACE_3D: Record<MascotFace, FaceKind> = {
  happy: "smile",
  excited: "excited",
  love: "love",
  surprised: "surprised",
  wink: "wink",
  giggle: "happy",
  think: "think",
  sleepy: "sleepy",
};

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

// The canvas is bigger than the mascot's box so raised arms, wings and the
// wand aren't cut off: this much extra on each side.
const PAD_X = 0.35;
const PAD_Y = 0.12;

export default function Mascot3D({
  size,
  pose = "wave",
  face,
  look,
  flip = false,
  still = false,
  talking = false,
  tucked = false,
  twirl = false,
}: {
  size: number;
  pose?: MascotPose;
  face?: MascotFace;
  look?: { x: number; y: number };
  flip?: boolean;
  still?: boolean;
  talking?: boolean;
  /** Rising edge: a little crouch and hop. */
  tucked?: boolean;
  /** Rising edge: a full spin. */
  twirl?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rig = useRef<Rig | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const shownFace = face ?? FACE_FOR_POSE[pose];
  const state = {
    gesture: GESTURE_FOR_POSE[pose],
    face: FACE_3D[shownFace],
    look: look ?? { x: 0, y: 0 },
    talking,
    still,
    flip,
  };
  const latest = useRef(state);
  // Hand the newest pose/face/look to the 3D model after each render.
  useEffect(() => {
    latest.current = state;
    rig.current?.set(state);
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([import("three"), import("./rig")])
      .then(([T, { createRig }]) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const r = createRig(T, canvas, { frame: 1 + PAD_Y * 2 + 0.06, onReady: () => !cancelled && setReady(true) });
        r.set(latest.current);
        rig.current = r;
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      rig.current?.dispose();
      rig.current = null;
    };
  }, []);

  useEffect(() => {
    if (tucked) rig.current?.poke("hop");
  }, [tucked]);
  useEffect(() => {
    if (twirl) rig.current?.poke("twirl");
  }, [twirl]);

  const width = mascotWidth(size);
  return (
    <span className="relative block" style={{ width, height: size }}>
      <span
        aria-hidden
        className="absolute inset-0 transition-opacity duration-500"
        style={{ opacity: ready && !failed ? 0 : 1 }}
      >
        <GlowMascot size={size} full pose={pose} face={face} look={look} flip={flip} alive={!still} blink={!still} talking={talking} tucked={tucked} />
      </span>
      {!failed && (
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute transition-opacity duration-500"
          style={{
            left: -width * PAD_X,
            top: -size * PAD_Y,
            width: width * (1 + PAD_X * 2),
            height: size * (1 + PAD_Y * 2),
            opacity: ready ? 1 : 0,
          }}
        />
      )}
    </span>
  );
}
