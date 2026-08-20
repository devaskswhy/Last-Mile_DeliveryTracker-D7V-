"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { EASE, EASE_GSAP, MOBILE_BREAKPOINT } from "./tokens";

/**
 * GSAP setup, run exactly once per browser session.
 *
 * `gsap.registerPlugin` is idempotent, but React strict mode double-invokes
 * effects and every animated component would otherwise re-register and re-derive
 * the ease. The guard makes the cost provably one-time rather than
 * one-time-in-practice.
 */
let registered = false;

/**
 * Evaluates a cubic Bézier for a given x, by Newton-Raphson with a bisection
 * fallback.
 *
 * This exists so the CSS curve and the GSAP curve are literally the same four
 * numbers rather than two approximations of each other. GSAP ships `CustomEase`
 * for this, but pulling in a plugin to re-derive a curve we already have the
 * control points for is more moving parts than the twenty lines below.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const a = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
  const b = (a1: number, a2: number) => 3 * a2 - 6 * a1;
  const c = (a1: number) => 3 * a1;

  const calc = (t: number, a1: number, a2: number) =>
    ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;

  const slope = (t: number, a1: number, a2: number) =>
    3 * a(a1, a2) * t * t + 2 * b(a1, a2) * t + c(a1);

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const currentSlope = slope(t, x1, x2);
      if (currentSlope === 0) break;
      const currentX = calc(t, x1, x2) - x;
      t -= currentX / currentSlope;
    }

    // Newton can wander outside [0,1] on flat sections; clamp by bisection.
    let low = 0;
    let high = 1;
    if (t < low) t = low;
    if (t > high) t = high;
    for (let i = 0; i < 8 && Math.abs(calc(t, x1, x2) - x) > 1e-5; i += 1) {
      if (calc(t, x1, x2) < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }

    return calc(t, y1, y2);
  };
}

export function registerMotion(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;

  gsap.registerPlugin(ScrollTrigger);
  gsap.registerEase(EASE_GSAP, cubicBezier(...EASE));

  // The default ease for every tween that does not name one, so forgetting to
  // pass `ease` still lands on the house curve rather than GSAP's `power1.out`.
  gsap.defaults({ ease: EASE_GSAP });

  // ScrollTrigger recalculates on every resize. On mobile that fires each time
  // the URL bar collapses, which is a scroll — not a layout change — so
  // ignoring it avoids a stream of pointless recalculations mid-gesture.
  ScrollTrigger.config({ ignoreMobileResize: true });
}

/** True when the visitor has asked for less motion, or the screen is small. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * True when the heavy scroll choreography should be skipped entirely: pins,
 * parallax and scrubbed timelines.
 */
export function shouldSimplifyMotion(): boolean {
  return prefersReducedMotion() || isMobileViewport();
}

export { gsap, ScrollTrigger };
