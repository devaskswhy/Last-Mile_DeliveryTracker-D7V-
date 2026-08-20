"use client";

import Lenis from "lenis";
import { useEffect } from "react";

import {
  ScrollTrigger,
  gsap,
  prefersReducedMotion,
  registerMotion,
} from "@/lib/motion/gsap";

/**
 * Smooth scroll, wired to GSAP once at the app root.
 *
 * Three things have to be true or scroll-linked animation goes subtly wrong:
 *
 * 1. **One Lenis instance.** Two instances fight over `scrollTop` and produce
 *    a stutter that looks like a performance problem and is not.
 * 2. **One clock.** Lenis is driven from `gsap.ticker` rather than its own
 *    `requestAnimationFrame`. With two independent loops, GSAP reads a scroll
 *    position Lenis is midway through changing, and pinned sections drift by a
 *    frame.
 * 3. **`lagSmoothing(0)`.** GSAP normally absorbs a long frame by pretending
 *    less time passed. That is right for a self-running tween and wrong for one
 *    scrubbed by scroll, where the scroll position is the source of truth and
 *    faking time desynchronises it.
 */

let instance: Lenis | null = null;

/** The single Lenis instance, for code that needs to pause scrolling. */
export function getLenis(): Lenis | null {
  return instance;
}

export function SmoothScroll() {
  useEffect(() => {
    registerMotion();

    // Someone who asked for reduced motion gets the browser's own scrolling.
    // Smooth scroll is itself motion, so honouring the preference means not
    // starting Lenis at all rather than starting it and animating less.
    if (prefersReducedMotion()) {
      ScrollTrigger.refresh();
      return;
    }

    const lenis = new Lenis({
      duration: 1.05,
      // Touch scrolling is left native. Lenis over a touch gesture fights the
      // platform's own momentum and reads as lag on exactly the devices that
      // can least afford the extra work.
      syncTouch: false,
      wheelMultiplier: 0.9,
    });
    instance = lenis;

    // Every Lenis frame tells ScrollTrigger to re-evaluate, so triggers see the
    // smoothed position rather than the browser's raw one.
    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => {
      // GSAP's ticker is in seconds; Lenis expects milliseconds.
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Fonts settle after first paint and change element heights. Without this
    // every trigger measured before the swap is off by however much the text
    // reflowed.
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh).catch(() => {});

    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      instance = null;
    };
  }, []);

  return null;
}
