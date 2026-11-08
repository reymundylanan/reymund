"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* Scroll and cursor motion for the public website (GSAP + ScrollTrigger).
 *
 * Sections opt in with markers in their markup — nothing here changes what a
 * page says or how it is laid out at rest:
 *   data-m="hero"      home hero: layered parallax, cinematic zoom, framed exit
 *   data-m="kinetic"   heading split into .kw words: masked word-by-word rise
 *   data-m="title"     plain heading: masked line rise
 *   data-m="widen"     section widens from an inset rounded frame to full width
 *   data-m="unveil"    grid of photo cards: scrubbed clip-path reveal + drifting photos
 *   data-m="wave"      grid: staggered rise (variant via data-m-v: wave | tilt | alt | cascade)
 *   data-m="hgallery"  pinned horizontal gallery driven by vertical scroll (desktop)
 *   data-m="branches"  list slides in, map unveils from the right
 *   data-m="expand"    pinned: a panel grows from a small window to full size
 *   data-m="photo-hero" page hero photo with depth layers
 *   data-m="clip-photo" a portrait revealed by a rising clip with a slow zoom-out
 *   data-m="fan"       cards fan out from a stack
 *   .m-par             a photo that drifts inside its frame
 *   [data-magnetic]    a button that leans toward the pointer
 *
 * Card transforms go through CSS custom properties (see globals.css) so the
 * cards' own hover lifts keep working. Every tween states its end values
 * (fromTo): reading them from the page can catch a CSS transition mid-way. Phones get light entrances only;
 * reduced-motion visitors get none. Admin and staff pages never load this. */

const PUBLIC = /^\/($|about|branches|services|team|promos)/;

const EASE_OUT = "expo.out";
const EASE_SOFT = "power3.out";

export default function SiteMotion() {
  const pathname = usePathname();

  useEffect(() => {
    if (!PUBLIC.test(pathname)) return;
    ScrollTrigger.config({ ignoreMobileResize: true });

    const mm = gsap.matchMedia();
    mm.add(
      {
        motion: "(prefers-reduced-motion: no-preference)",
        desktop: "(min-width: 1024px)",
        finePointer: "(pointer: fine)",
      },
      (ctx) => {
        const { motion, desktop, finePointer } = ctx.conditions as Record<string, boolean>;
        if (!motion) return;

        const all = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
          Array.from(root.querySelectorAll<T & HTMLElement>(sel));
        const items = (grid: Element) => {
          const kids = Array.from(grid.children) as HTMLElement[];
          kids.forEach((k) => k.classList.add("m-i"));
          return kids;
        };

        // ── Home hero: layered parallax and a framed, cinematic exit ──
        all('[data-m="hero"]').forEach((hero) => {
          const media = hero.querySelector<HTMLElement>("[data-m-media]");
          const content = hero.querySelector<HTMLElement>("[data-m-content]");
          const copy = hero.querySelector<HTMLElement>("[data-m-copy]");
          const card = hero.querySelector<HTMLElement>("[data-m-card]");
          if (media) gsap.set(media, { "--ps": 1.08 });
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 },
          });
          if (media) tl.to(media, { "--py": "18%", "--ps": 1.22 }, 0);
          if (copy) { copy.classList.add("m-i"); tl.to(copy, { "--my": desktop ? "-140px" : "-60px" }, 0); }
          if (card) { card.classList.add("m-i"); tl.to(card, { "--my": desktop ? "-60px" : "-30px", "--ms": 0.96 }, 0); }
          if (content) tl.to(content, { opacity: 0, ease: "power1.in" }, 0.15);
          if (desktop) {
            tl.fromTo(
              hero,
              { clipPath: "inset(0% 0% 0% 0% round 0px)" },
              { clipPath: "inset(0% 2.5% 7% 2.5% round 40px)" },
              0
            );
          }
        });

        // ── Kinetic headings: words rise from behind a mask ──
        all('[data-m="kinetic"]').forEach((h) => {
          const words = all(".kw > span", h);
          const box = h.parentElement ?? h;
          const lines = all("[data-m-line]", box);
          const tl = gsap.timeline({
            scrollTrigger: { trigger: h, start: "top 88%", end: "top 30%", toggleActions: "play none none reverse" },
          });
          tl.from(words, { yPercent: 115, rotate: 7, duration: 1.1, ease: EASE_OUT, stagger: 0.07, transformOrigin: "0% 100%" });
          if (lines.length) tl.from(lines, { scaleX: 0, duration: 1, ease: EASE_SOFT, stagger: 0.1 }, 0.1);
          const sibs = Array.from(box.children).filter((c) => c !== h) as HTMLElement[];
          if (sibs.length) tl.fromTo(sibs, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: EASE_SOFT, stagger: 0.08 }, 0.25);
        });

        // ── Plain headings: a masked line rise ──
        all('[data-m="title"]').forEach((h) => {
          gsap.from(h, {
            clipPath: "inset(0% 0% 100% 0%)",
            y: 40,
            duration: 1.2,
            ease: EASE_OUT,
            clearProps: "clipPath",
            scrollTrigger: { trigger: h, start: "top 88%", toggleActions: "play none none reverse" },
          });
        });

        // ── A section that widens from a framed inset to full width ──
        all('[data-m="widen"]').forEach((s) => {
          gsap.fromTo(
            s,
            { clipPath: desktop ? "inset(0% 5% 0% 5% round 48px)" : "inset(0% 3% 0% 3% round 28px)" },
            {
              clipPath: "inset(0% 0% 0% 0% round 0px)",
              ease: "none",
              scrollTrigger: { trigger: s, start: "top bottom", end: "top 25%", scrub: 0.8 },
            }
          );
        });

        // ── Photo cards: scrubbed clip-path unveil, photos drift inside ──
        all('[data-m="unveil"]').forEach((grid) => {
          const cards = items(grid);
          gsap.fromTo(
            cards,
            { clipPath: "inset(100% 0% 0% 0% round 24px)", "--my": "90px" },
            {
              clipPath: "inset(-12% -12% -12% -12% round 24px)",
              "--my": "0px",
              ease: "power2.out",
              stagger: 0.12,
              scrollTrigger: { trigger: grid, start: "top 92%", end: desktop ? "top 35%" : "top 55%", scrub: 0.9 },
            }
          );
        });

        // ── Photos drifting inside their frames (multi-speed parallax) ──
        all(".m-par").forEach((img, i) => {
          if (img.closest('[data-m="hero"]')) return;
          const frame = img.parentElement ?? img;
          const depth = 6 + (i % 3) * 3; // vary the speed so rows don't move as one
          gsap.set(img, { "--ps": 1.16 });
          gsap.fromTo(
            img,
            { "--py": `-${depth}%` },
            { "--py": `${depth}%`, ease: "none", scrollTrigger: { trigger: frame, start: "top bottom", end: "bottom top", scrub: true } }
          );
        });

        // ── Staggered entrances, a different character per section ──
        all('[data-m="wave"]').forEach((grid) => {
          const cards = items(grid);
          const v = grid.getAttribute("data-m-v") ?? "wave";
          const from: gsap.TweenVars =
            v === "tilt"
              ? { "--my": "70px", "--mr": "-4deg", opacity: 0 }
              : v === "alt"
                ? { "--my": (i: number) => (i % 2 ? "110px" : "40px"), "--ms": 0.9, opacity: 0 }
                : v === "cascade"
                  ? { "--mx": (i: number) => `${(i % 3) * 30 - 30}px`, "--my": "80px", opacity: 0 }
                  : { "--my": "100px", "--ms": 0.94, opacity: 0 };
          gsap.fromTo(cards, from, {
            "--my": "0px",
            "--mx": "0px",
            "--mr": "0deg",
            "--ms": 1,
            opacity: 1,
            duration: 1.25,
            ease: EASE_OUT,
            stagger: { each: v === "alt" ? 0.06 : 0.11, from: v === "cascade" ? "center" : "start" },
            scrollTrigger: { trigger: grid, start: "top 85%", toggleActions: "play none none reverse" },
          });
        });

        // ── Pinned horizontal gallery (desktop) ──
        all('[data-m="hgallery"]').forEach((section) => {
          const track = section.querySelector<HTMLElement>("[data-m-track]");
          if (!track) return;
          const cards = items(track);
          if (!desktop || cards.length < 3) {
            gsap.fromTo(cards, { "--my": "70px", opacity: 0 }, {
              "--my": "0px", opacity: 1, duration: 1.1, ease: EASE_OUT, stagger: 0.1,
              scrollTrigger: { trigger: track, start: "top 85%", toggleActions: "play none none reverse" },
            });
            return;
          }
          gsap.set(section, { overflow: "hidden" });
          gsap.set(track, { display: "flex", flexWrap: "nowrap", gap: "1.75rem", alignItems: "stretch" });
          gsap.set(cards, { flex: "0 0 min(30rem, 40vw)" });
          const distance = () => Math.max(track.scrollWidth - track.clientWidth, 0);
          const slide = gsap.to(track, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: () => `+=${distance() + window.innerHeight * 0.25}`,
              pin: true,
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          });
          cards.forEach((c, i) => {
            gsap.fromTo(
              c,
              { "--mr": i % 2 ? "2.5deg" : "-2.5deg", "--ms": 0.9, opacity: 0.45 },
              {
                "--mr": "0deg", "--ms": 1, opacity: 1, ease: "none",
                scrollTrigger: { trigger: c, containerAnimation: slide, start: "left 98%", end: "left 72%", scrub: true },
              }
            );
          });
        });

        // ── Branches: list slides in, the map unveils from the right ──
        all('[data-m="branches"]').forEach((s) => {
          const list = s.querySelector<HTMLElement>("[data-m-list]");
          const map = s.querySelector<HTMLElement>("[data-m-map]");
          const tl = gsap.timeline({ scrollTrigger: { trigger: s, start: "top 75%", toggleActions: "play none none reverse" } });
          if (list) tl.fromTo(items(list), { "--mx": "-80px", opacity: 0 }, { "--mx": "0px", opacity: 1, duration: 1.1, ease: EASE_OUT, stagger: 0.12 });
          if (map) tl.from(map, { clipPath: "inset(0% 0% 0% 100% round 16px)", duration: 1.5, ease: "expo.inOut", clearProps: "clipPath" }, 0.1);
        });

        // ── A panel that grows from a small window to full size (pinned on desktop) ──
        all('[data-m="expand"]').forEach((s) => {
          const box = s.querySelector<HTMLElement>("[data-m-box]");
          if (!box) return;
          const stats = all("[data-m-stat]", s);
          const copy = all("[data-m-copy]", s);
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: desktop
              ? { trigger: s, start: "center center", end: "+=70%", pin: true, scrub: 0.8 }
              : { trigger: s, start: "top 85%", end: "top 30%", scrub: 0.8 },
          });
          tl.fromTo(box, { clipPath: "inset(12% 20% 12% 20% round 56px)" }, { clipPath: "inset(0% 0% 0% 0% round 24px)", duration: 1 }, 0);
          if (copy.length) tl.fromTo(copy, { y: 50, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.12, duration: 0.6 }, 0.25);
          if (stats.length) tl.fromTo(stats, { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.5 }, 0.55);
        });

        // ── Page heroes with a photo: depth layers ──
        all('[data-m="photo-hero"]').forEach((hero) => {
          const img = hero.querySelector<HTMLElement>("[data-m-media]");
          const layers = all("[data-m-depth]", hero);
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.5 },
          });
          if (img) { gsap.set(img, { "--ps": 1.1 }); tl.to(img, { "--py": "16%", "--ps": 1.2 }, 0); }
          layers.forEach((l) => {
            l.classList.add("m-i");
            const d = Number(l.getAttribute("data-m-depth")) || 0.5;
            tl.to(l, { "--my": `${-160 * d}px`, opacity: 1 - d * 0.9 }, 0);
          });
          gsap.fromTo(
            layers.flatMap((l) => Array.from(l.children)),
            { y: 50, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.3, ease: EASE_OUT, stagger: 0.12, delay: 0.15 }
          );
        });

        // ── A portrait revealed by a rising clip, zooming out slowly ──
        all('[data-m="clip-photo"]').forEach((frame) => {
          const img = frame.querySelector("img");
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: frame, start: "top 90%", end: "top 25%", scrub: 0.8 },
          });
          tl.fromTo(frame, { clipPath: "inset(30% 12% 0% 12% round 120px)" }, { clipPath: "inset(0% 0% 0% 0% round 24px)" }, 0);
          if (img) tl.fromTo(img, { scale: 1.35 }, { scale: 1 }, 0);
        });

        // ── Cards fanning out from a stack ──
        all('[data-m="fan"]').forEach((grid) => {
          const cards = items(grid);
          const mid = (cards.length - 1) / 2;
          gsap.fromTo(
            cards,
            {
              "--mx": (i: number) => (desktop ? `${(mid - i) * 105}%` : "0%"),
              "--mr": (i: number) => `${(i - mid) * 7}deg`,
              "--my": "60px",
              "--ms": 0.92,
            },
            {
              "--mx": "0%", "--mr": "0deg", "--my": "0px", "--ms": 1, ease: "power2.out", stagger: 0.04,
              scrollTrigger: { trigger: grid, start: "top 90%", end: "top 40%", scrub: 0.8 },
            }
          );
        });

        // ── Cursor: a gold ring that trails the mouse; magnetic buttons ──
        let cleanupCursor = () => {};
        if (finePointer) {
          const ring = document.createElement("div");
          ring.className = "m-cursor";
          ring.setAttribute("aria-hidden", "true");
          const label = document.createElement("span");
          ring.appendChild(label);
          document.body.appendChild(ring);
          gsap.set(ring, { xPercent: -50, yPercent: -50, opacity: 0 });
          const x = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
          const y = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });
          let shown = false;
          const move = (e: PointerEvent) => {
            if (e.pointerType !== "mouse") return;
            x(e.clientX);
            y(e.clientY);
            if (!shown) { shown = true; gsap.to(ring, { opacity: 1, duration: 0.3 }); }
            const t = e.target as Element | null;
            const view = t?.closest?.("[data-cursor]");
            const hot = t?.closest?.("a, button, [role=button], input, select, textarea, label");
            ring.dataset.state = view ? "view" : hot ? "hot" : "";
            label.textContent = view?.getAttribute("data-cursor") ?? "";
          };
          const leave = () => { shown = false; gsap.to(ring, { opacity: 0, duration: 0.3 }); };
          const down = () => gsap.to(ring, { scale: 0.8, duration: 0.15 });
          const up = () => gsap.to(ring, { scale: 1, duration: 0.4, ease: "elastic.out(1, 0.5)" });
          window.addEventListener("pointermove", move, { passive: true });
          document.documentElement.addEventListener("pointerleave", leave);
          window.addEventListener("pointerdown", down);
          window.addEventListener("pointerup", up);

          const magnets = all("[data-magnetic]");
          const offs = magnets.map((m) => {
            m.classList.add("m-i");
            const mx = gsap.quickTo(m, "--mx", { duration: 0.6, ease: "power3" });
            const my = gsap.quickTo(m, "--my", { duration: 0.6, ease: "power3" });
            const onMove = (e: PointerEvent) => {
              const r = m.getBoundingClientRect();
              mx((e.clientX - (r.left + r.width / 2)) * 0.25);
              my((e.clientY - (r.top + r.height / 2)) * 0.35);
            };
            const onLeave = () => {
              gsap.to(m, { "--mx": "0px", "--my": "0px", duration: 0.9, ease: "elastic.out(1, 0.4)" });
            };
            m.addEventListener("pointermove", onMove);
            m.addEventListener("pointerleave", onLeave);
            return () => {
              m.removeEventListener("pointermove", onMove);
              m.removeEventListener("pointerleave", onLeave);
            };
          });

          cleanupCursor = () => {
            window.removeEventListener("pointermove", move);
            document.documentElement.removeEventListener("pointerleave", leave);
            window.removeEventListener("pointerdown", down);
            window.removeEventListener("pointerup", up);
            offs.forEach((off) => off());
            ring.remove();
          };
        }

        return () => {
          cleanupCursor();
          all(".m-i").forEach((el) => el.classList.remove("m-i"));
        };
      }
    );

    // Photos and fonts change heights after load; re-measure the triggers.
    const refresh = () => ScrollTrigger.refresh();
    const t = window.setTimeout(refresh, 900);
    window.addEventListener("load", refresh);
    document.fonts?.ready.then(refresh).catch(() => {});

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("load", refresh);
      mm.revert();
    };
  }, [pathname]);

  return null;
}
