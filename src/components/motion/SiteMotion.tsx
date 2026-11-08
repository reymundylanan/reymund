"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* Scroll motion for the public website (GSAP + ScrollTrigger). Kept calm on
 * purpose: short distances, no spins or tilts, soft easing, things play
 * once as they arrive, and only the Reviews gallery pins.
 *
 * Sections opt in with markers in their markup — nothing here changes what a
 * page says or how it is laid out at rest:
 *   data-m="hero"       home hero: gentle layered parallax, framed exit
 *   data-m="kinetic"    heading split into .kw words: masked word-by-word rise
 *   data-m="title"      plain heading: soft rise
 *   data-m="widen"      section widens from a slightly inset frame to full width
 *   data-m="unveil"     photo cards: scrubbed clip-path reveal
 *   data-m="wave"       grid: staggered rise (data-m-v: wave | alt | cascade)
 *   data-m="hgallery"   pinned horizontal gallery driven by vertical scroll (desktop)
 *   data-m="branches"   list slides in, map unveils from the right
 *   data-m="expand"     a panel opens from a slightly smaller window
 *   data-m="photo-hero" page hero photo with depth layers
 *   data-m="clip-photo" a portrait revealed by a rising clip
 *   .m-par              a photo that drifts slowly inside its frame
 *   [data-magnetic]     a button that leans a touch toward the pointer
 *
 * Transforms go through CSS custom properties (see globals.css) so the
 * cards' own hover lifts keep working, and every tween states its end values
 * (fromTo): reading them from the page can catch a CSS transition mid-way.
 * Phones get light entrances only; reduced-motion visitors get none. Admin
 * and staff pages never run this. */

const PUBLIC = /^\/($|about|branches|services|team|promos)/;

const EASE = "power3.out";
const ONCE = "play none none none";

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

        const all = (sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<HTMLElement>(sel));
        const items = (grid: Element) => {
          const kids = Array.from(grid.children) as HTMLElement[];
          kids.forEach((k) => k.classList.add("m-i"));
          return kids;
        };

        // ── Home hero: gentle layered parallax and a softly framed exit ──
        all('[data-m="hero"]').forEach((hero) => {
          const media = hero.querySelector<HTMLElement>("[data-m-media]");
          const content = hero.querySelector<HTMLElement>("[data-m-content]");
          const copy = hero.querySelector<HTMLElement>("[data-m-copy]");
          const card = hero.querySelector<HTMLElement>("[data-m-card]");
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 1 },
          });
          if (media) tl.fromTo(media, { "--py": "0%", "--ps": 1.06 }, { "--py": "12%", "--ps": 1.12 }, 0);
          if (copy) { copy.classList.add("m-i"); tl.fromTo(copy, { "--my": "0px" }, { "--my": desktop ? "-70px" : "-30px" }, 0); }
          if (card) { card.classList.add("m-i"); tl.fromTo(card, { "--my": "0px" }, { "--my": desktop ? "-35px" : "-15px" }, 0); }
          if (content) tl.fromTo(content, { opacity: 1 }, { opacity: 0.15, ease: "power1.in" }, 0.2);
          if (desktop) {
            tl.fromTo(hero, { clipPath: "inset(0% 0% 0% 0% round 0px 0px 0px 0px)" }, { clipPath: "inset(0% 1.5% 0% 1.5% round 0px 0px 28px 28px)" }, 0);
          }
        });

        // ── Kinetic headings: words rise from behind a mask, once ──
        all('[data-m="kinetic"]').forEach((h) => {
          const words = all(".kw > span", h);
          const box = h.parentElement ?? h;
          const lines = all("[data-m-line]", box);
          const sibs = Array.from(box.children).filter((c) => c !== h) as HTMLElement[];
          const tl = gsap.timeline({ scrollTrigger: { trigger: h, start: "top 88%", toggleActions: ONCE } });
          tl.fromTo(words, { yPercent: 100 }, { yPercent: 0, duration: 1.1, ease: EASE, stagger: 0.05 });
          if (lines.length) tl.fromTo(lines, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: EASE }, 0.1);
          if (sibs.length) tl.fromTo(sibs, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: EASE, stagger: 0.08 }, 0.2);
        });

        // ── Plain headings: a soft rise, once ──
        all('[data-m="title"]').forEach((h) => {
          gsap.fromTo(
            h,
            { y: 24, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.1, ease: EASE, scrollTrigger: { trigger: h, start: "top 88%", toggleActions: ONCE } }
          );
        });

        // ── A section that widens from a slightly inset frame to full width ──
        all('[data-m="widen"]').forEach((s) => {
          gsap.fromTo(
            s,
            { clipPath: desktop ? "inset(0% 3% 0% 3% round 32px)" : "inset(0% 2% 0% 2% round 20px)" },
            {
              clipPath: "inset(0% 0% 0% 0% round 0px)",
              ease: "none",
              scrollTrigger: { trigger: s, start: "top bottom", end: "top 30%", scrub: 1 },
            }
          );
        });

        // ── Photo cards: a scrubbed clip-path unveil ──
        all('[data-m="unveil"]').forEach((grid) => {
          const cards = items(grid);
          gsap.fromTo(
            cards,
            { clipPath: "inset(100% 0% 0% 0% round 24px)", "--my": "40px" },
            {
              clipPath: "inset(-12% -12% -12% -12% round 24px)",
              "--my": "0px",
              ease: "power1.out",
              stagger: 0.1,
              scrollTrigger: { trigger: grid, start: "top 92%", end: desktop ? "top 45%" : "top 60%", scrub: 1 },
            }
          );
        });

        // ── Photos drifting slowly inside their frames ──
        all(".m-par").forEach((img, i) => {
          if (img.closest('[data-m="hero"]') || img.closest('[data-m="photo-hero"]')) return;
          const frame = img.parentElement ?? img;
          const depth = 3 + (i % 3); // slightly different speeds so rows don't move as one
          gsap.fromTo(
            img,
            { "--py": `-${depth}%`, "--ps": 1.1 },
            { "--py": `${depth}%`, "--ps": 1.1, ease: "none", scrollTrigger: { trigger: frame, start: "top bottom", end: "bottom top", scrub: 1 } }
          );
        });

        // ── Staggered entrances, once, a different rhythm per section ──
        all('[data-m="wave"]').forEach((grid) => {
          const cards = items(grid);
          const v = grid.getAttribute("data-m-v") ?? "wave";
          const from: gsap.TweenVars =
            v === "alt"
              ? { "--mx": "0px", "--my": (i: number) => (i % 2 ? "56px" : "28px"), opacity: 0 }
              : v === "cascade"
                ? { "--mx": (i: number) => `${(i % 3) * 12 - 12}px`, "--my": "36px", opacity: 0 }
                : { "--mx": "0px", "--my": "40px", opacity: 0 };
          gsap.fromTo(cards, from, {
            "--mx": "0px",
            "--my": "0px",
            opacity: 1,
            duration: 1.1,
            ease: EASE,
            stagger: { each: 0.09, from: v === "cascade" ? "center" : "start" },
            scrollTrigger: { trigger: grid, start: "top 86%", toggleActions: ONCE },
          });
        });

        // ── Pinned horizontal gallery (desktop); a plain stagger elsewhere ──
        all('[data-m="hgallery"]').forEach((section) => {
          const track = section.querySelector<HTMLElement>("[data-m-track]");
          if (!track) return;
          const cards = items(track);
          if (!desktop || cards.length < 3) {
            gsap.fromTo(cards, { "--my": "36px", opacity: 0 }, {
              "--my": "0px", opacity: 1, duration: 1.1, ease: EASE, stagger: 0.09,
              scrollTrigger: { trigger: track, start: "top 86%", toggleActions: ONCE },
            });
            return;
          }
          gsap.set(section, { overflow: "hidden" });
          gsap.set(track, { display: "flex", flexWrap: "nowrap", gap: "1.5rem", alignItems: "stretch" });
          gsap.set(cards, { flex: "0 0 min(30rem, 40vw)" });
          const distance = () => Math.max(track.scrollWidth - track.clientWidth, 0);
          gsap.to(track, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: () => `+=${distance()}`,
              pin: true,
              scrub: 1,
              invalidateOnRefresh: true,
            },
          });
        });

        // ── Branches: list slides in, the map unveils from the right ──
        all('[data-m="branches"]').forEach((s) => {
          const list = s.querySelector<HTMLElement>("[data-m-list]");
          const map = s.querySelector<HTMLElement>("[data-m-map]");
          const tl = gsap.timeline({ scrollTrigger: { trigger: s, start: "top 75%", toggleActions: ONCE } });
          if (list) tl.fromTo(items(list), { "--mx": "-32px", opacity: 0 }, { "--mx": "0px", opacity: 1, duration: 1.1, ease: EASE, stagger: 0.1 });
          if (map) {
            tl.fromTo(
              map,
              { clipPath: "inset(0% 0% 0% 100% round 16px)" },
              { clipPath: "inset(0% 0% 0% 0% round 16px)", duration: 1.3, ease: "power3.inOut", clearProps: "clipPath" },
              0.1
            );
          }
        });

        // ── A panel that opens from a slightly smaller window ──
        all('[data-m="expand"]').forEach((s) => {
          const box = s.querySelector<HTMLElement>("[data-m-box]");
          if (!box) return;
          const stats = all("[data-m-stat]", s);
          const copy = all("[data-m-copy]", s);
          gsap.fromTo(
            box,
            { clipPath: desktop ? "inset(6% 8% 6% 8% round 40px)" : "inset(4% 3% 4% 3% round 28px)" },
            {
              clipPath: "inset(0% 0% 0% 0% round 24px)",
              ease: "none",
              scrollTrigger: { trigger: s, start: "top 90%", end: "top 35%", scrub: 1 },
            }
          );
          const tl = gsap.timeline({ scrollTrigger: { trigger: box, start: "top 70%", toggleActions: ONCE } });
          if (copy.length) tl.fromTo(copy, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: EASE, stagger: 0.1 });
          if (stats.length) tl.fromTo(stats, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: EASE, stagger: 0.07 }, 0.3);
        });

        // ── Page heroes with a photo: soft depth layers ──
        all('[data-m="photo-hero"]').forEach((hero) => {
          const img = hero.querySelector<HTMLElement>("[data-m-media]");
          const layers = all("[data-m-depth]", hero);
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 1 },
          });
          if (img) tl.fromTo(img, { "--py": "0%", "--ps": 1.06 }, { "--py": "10%", "--ps": 1.1 }, 0);
          layers.forEach((l) => {
            l.classList.add("m-i");
            const d = Number(l.getAttribute("data-m-depth")) || 0.5;
            tl.fromTo(l, { "--my": "0px" }, { "--my": `${-80 * d}px` }, 0);
          });
          gsap.fromTo(
            layers.flatMap((l) => Array.from(l.children)),
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.2, ease: EASE, stagger: 0.1, delay: 0.1 }
          );
        });

        // ── A portrait revealed by a rising clip ──
        all('[data-m="clip-photo"]').forEach((frame) => {
          const img = frame.querySelector("img");
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: frame, start: "top 90%", end: "top 40%", scrub: 1 },
          });
          tl.fromTo(frame, { clipPath: "inset(16% 6% 0% 6% round 48px)" }, { clipPath: "inset(0% 0% 0% 0% round 24px)" }, 0);
          if (img) tl.fromTo(img, { scale: 1.12 }, { scale: 1 }, 0);
        });

        // ── The main buttons lean a touch toward the pointer ──
        let offMagnets = () => {};
        if (finePointer) {
          const offs = all("[data-magnetic]").map((m) => {
            m.classList.add("m-i");
            const mx = gsap.quickTo(m, "--mx", { duration: 0.8, ease: "power3" });
            const my = gsap.quickTo(m, "--my", { duration: 0.8, ease: "power3" });
            const onMove = (e: PointerEvent) => {
              const r = m.getBoundingClientRect();
              mx((e.clientX - (r.left + r.width / 2)) * 0.12);
              my((e.clientY - (r.top + r.height / 2)) * 0.18);
            };
            const onLeave = () => gsap.to(m, { "--mx": "0px", "--my": "0px", duration: 0.9, ease: "power3.out" });
            m.addEventListener("pointermove", onMove);
            m.addEventListener("pointerleave", onLeave);
            return () => {
              m.removeEventListener("pointermove", onMove);
              m.removeEventListener("pointerleave", onLeave);
            };
          });
          offMagnets = () => offs.forEach((off) => off());
        }

        return () => {
          offMagnets();
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
