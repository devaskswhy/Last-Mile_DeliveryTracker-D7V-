/**
 * Motion tokens — the single source for how this product moves.
 *
 * There is exactly **one** easing curve. It is defined here as four numbers and
 * consumed two ways: Tailwind turns it into a CSS `cubic-bezier`, and
 * `registerMotion()` turns the same numbers into a GSAP ease. A CSS transition
 * and a GSAP tween on the same page therefore travel identically — which is the
 * whole reason a house curve exists. Adding a second one is how a site starts
 * feeling assembled rather than designed.
 */

/**
 * An expo-out shape: leaves fast, settles slowly and lands without a bounce.
 * Decisive rather than playful, which is the register a logistics product wants.
 */
export const EASE = [0.16, 1, 0.3, 1] as const;

export const EASE_CSS = `cubic-bezier(${EASE.join(", ")})`;

/** GSAP's registered name for the same curve. */
export const EASE_GSAP = "lm";

/**
 * Durations, in seconds. Three steps only — a scale with more rungs than that
 * stops being a scale and becomes a preference.
 */
export const DURATION = {
  /** Hovers, button presses, small state flips. */
  fast: 0.35,
  /** The default: reveals, section entrances. */
  base: 0.8,
  /** Deliberate, cinematic beats. The preloader wipe, the hero settle. */
  slow: 1.4,
} as const;

/** Stagger between siblings in a reveal group. */
export const STAGGER = 0.08;

/**
 * Below this width the scroll choreography is cut back: pins are dropped,
 * parallax is skipped, and reveals become a single fade.
 *
 * Phones are where scroll-linked work costs the most — less GPU, less memory
 * bandwidth, and a URL bar that resizes the viewport mid-scroll and forces
 * ScrollTrigger to recalculate. The cheapest fix is to not do the expensive
 * thing there.
 */
export const MOBILE_BREAKPOINT = 768;
