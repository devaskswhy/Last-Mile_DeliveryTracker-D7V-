"use client";

import { useEffect, useRef, useState } from "react";

import { DURATION, EASE_GSAP } from "@/lib/motion/tokens";
import { gsap, prefersReducedMotion, registerMotion } from "@/lib/motion/gsap";

import { getLenis } from "./SmoothScroll";

/**
 * Cinematic preloader: a counter to 100, then a wipe.
 *
 * The minimum display time is the point. On a warm cache everything is ready in
 * ~50ms, and a loader that flashes for three frames reads as a glitch rather
 * than as loading — so the counter is paced to a floor regardless of how fast
 * the page is actually ready. It is honest about real waits too: if assets take
 * longer than the floor, it holds until they finish instead of sitting at 100%.
 */
const MINIMUM_MS = 2000;

export function Preloader() {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const wipe = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerMotion();

    // Nothing should scroll while the curtain is up — including a stray
    // keyboard or trackpad gesture behind it.
    const lenis = getLenis();
    lenis?.stop();
    document.body.style.overflow = "hidden";

    const started = performance.now();
    let raf = 0;
    let assetsReady = false;

    const onLoad = () => {
      assetsReady = true;
    };
    if (document.readyState === "complete") assetsReady = true;
    else window.addEventListener("load", onLoad, { once: true });

    const step = () => {
      const elapsed = performance.now() - started;

      // Progress tracks the floor, not real asset progress — browsers do not
      // expose a reliable overall figure, and a bar that jumps 0 → 100 is worse
      // than an honest, evenly paced one.
      const paced = Math.min(elapsed / MINIMUM_MS, 1);

      // Ease the count so it decelerates into 100 rather than arriving flat.
      const eased = 1 - Math.pow(1 - paced, 3);
      const next = Math.round(eased * 100);

      // Hold at 99 if the floor is met but the page genuinely is not ready.
      setProgress(assetsReady ? next : Math.min(next, 99));

      if (paced >= 1 && assetsReady) {
        setDone(true);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  useEffect(() => {
    if (!done) return;

    const release = () => {
      document.body.style.overflow = "";
      getLenis()?.start();
      // Tell the page it may run its entrance animations now.
      window.dispatchEvent(new CustomEvent("lm:preloader-done"));
    };

    if (prefersReducedMotion()) {
      gsap.set(root.current, { autoAlpha: 0 });
      release();
      return;
    }

    const timeline = gsap.timeline({ onComplete: release });

    timeline
      // The counter leaves first, so the wipe covers an empty screen.
      .to(counter.current, {
        autoAlpha: 0,
        y: -24,
        duration: DURATION.fast,
        ease: EASE_GSAP,
      })
      // The wipe is a scaleY on a transform origin — not a height animation.
      // Height would relayout the document on every frame of a full-screen
      // element, which is the single most expensive thing an entrance can do.
      .to(
        wipe.current,
        {
          scaleY: 0,
          transformOrigin: "top center",
          duration: DURATION.slow,
          ease: EASE_GSAP,
        },
        "-=0.1",
      )
      .set(root.current, { autoAlpha: 0, pointerEvents: "none" });

    return () => {
      timeline.kill();
    };
  }, [done]);

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100]"
    >
      <div
        ref={wipe}
        className="absolute inset-0 flex items-end justify-between bg-ink px-gutter pb-gutter will-change-transform"
      >
        <div ref={counter} className="flex w-full items-end justify-between">
          <span className="text-eyebrow uppercase text-ink-muted">
            Last-Mile
          </span>
          <span className="font-mono text-display leading-none text-ink-bright tabular-nums">
            {String(progress).padStart(3, "0")}
            <span className="text-signal">%</span>
          </span>
        </div>

        {/* Progress rule. scaleX only — never width. */}
        <div className="absolute inset-x-gutter bottom-0 h-px bg-ink-line">
          <div
            className="h-full origin-left bg-signal will-change-transform"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>
      </div>
    </div>
  );
}
