"use client";

import { useEffect, useRef, type ReactNode } from "react";

import {
  ScrollTrigger,
  gsap,
  prefersReducedMotion,
  registerMotion,
} from "@/lib/motion/gsap";
import { DURATION, MOBILE_BREAKPOINT, STAGGER } from "@/lib/motion/tokens";

/**
 * All scroll choreography for the landing page, in one place.
 *
 * The markup is server-rendered and static; this component only animates it, so
 * the page is readable before any JavaScript runs and the animation is purely
 * additive.
 *
 * ## Performance rules this file follows
 *
 * - **Transform and opacity only.** Nothing here touches `top`, `left`,
 *   `width` or `height`. Those properties invalidate layout, so the browser
 *   re-runs layout and paint for every frame; transform and opacity are handled
 *   by the compositor and skip both.
 * - **Consolidated triggers.** Reveals go through a single `ScrollTrigger.batch`
 *   rather than one trigger per element. Twenty elements would otherwise mean
 *   twenty triggers, each measured on every refresh.
 * - **One pin, desktop only.** Pinning changes document height and forces a
 *   full recalculation; more than one is where scroll pages start to feel
 *   heavy.
 * - **`gsap.matchMedia` for the breakpoint**, so crossing it tears down the
 *   heavy timeline properly instead of leaving a stale pin behind.
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  // The children are wrapped so GSAP's scope is the subtree being animated.
  // Every selector below resolves inside it, and `media.revert()` on unmount
  // kills exactly these tweens and triggers rather than anything global.
  // Children arrive from a server component, so the markup stays
  // server-rendered — only the animation is client-side.
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerMotion();

    const media = gsap.matchMedia(scope);

    // ---- Hero entrance -------------------------------------------------
    // The hidden state is set here rather than in CSS. If this script never
    // runs — JS disabled, a chunk that fails to load — the markup is already
    // readable, instead of a page of invisible text held down by an
    // `opacity-0` class that nothing will ever remove.
    const reduced = prefersReducedMotion();

    if (!reduced) {
      gsap.set("[data-hero-line]", { yPercent: 100, autoAlpha: 0 });
      gsap.set("[data-hero-meta]", { y: 12, autoAlpha: 0 });
    }

    // Waits for the preloader so the two do not animate over each other.
    const playHero = () => {
      if (reduced) return;
      const targets = gsap.utils.toArray<HTMLElement>("[data-hero-line]");
      if (targets.length === 0) return;

      gsap.to(targets, {
        yPercent: 0,
        autoAlpha: 1,
        duration: DURATION.slow,
        stagger: STAGGER * 1.5,
        clearProps: "willChange",
      });

      // This paragraph is the page's largest contentful element, so its delay
      // is directly the LCP figure. Kept short deliberately.
      gsap.to("[data-hero-meta]", {
        autoAlpha: 1,
        y: 0,
        duration: DURATION.base,
        delay: 0.12,
      });
    };

    window.addEventListener("lm:preloader-done", playHero, { once: true });
    // Safety net: if the preloader never signals (soft navigation, or it was
    // not rendered) the hero must still arrive rather than stay hidden.
    const heroFallback = window.setTimeout(playHero, 2200);

    media.add(
      {
        // Three explicit conditions rather than two, so "small screen" and
        // "asked for less motion" can be answered differently. Reduced motion
        // gets no hiding at all — content simply is where it belongs.
        full: `(min-width: ${MOBILE_BREAKPOINT}px) and (prefers-reduced-motion: no-preference)`,
        compact: `(max-width: ${MOBILE_BREAKPOINT - 1}px) and (prefers-reduced-motion: no-preference)`,
        reduced: `(prefers-reduced-motion: reduce)`,
      },
      (context) => {
        const { full, reduced: isReduced } = context.conditions as {
          full: boolean;
          compact: boolean;
          reduced: boolean;
        };

        if (isReduced) return;

        // ---- Reveals: ONE batched trigger for every marked element -----
        const revealTargets = gsap.utils.toArray<HTMLElement>("[data-reveal]");

        gsap.set(revealTargets, { autoAlpha: 0, y: full ? 34 : 16 });

        ScrollTrigger.batch(revealTargets, {
          start: "top 88%",
          once: true,
          onEnter: (elements) =>
            gsap.to(elements, {
              autoAlpha: 1,
              y: 0,
              duration: full ? DURATION.base : DURATION.fast,
              stagger: full ? STAGGER : 0,
              // Releasing the layer hint afterwards keeps a long page from
              // holding a composited layer per revealed element for its
              // whole lifetime.
              clearProps: "willChange",
            }),
        });

        if (!full) {
          // Mobile and reduced-motion stop here: no pin, no parallax, no
          // scrubbed timelines. Reveals alone.
          return;
        }

        // ---- Hero parallax --------------------------------------------
        gsap.to("[data-hero-visual]", {
          yPercent: 18,
          ease: "none",
          scrollTrigger: {
            trigger: "[data-hero]",
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
          },
        });

        // ---- The one pinned section ------------------------------------
        const steps = gsap.utils.toArray<HTMLElement>("[data-step]");
        if (steps.length > 0) {
          // Hidden here, not in the markup, for the same no-JS reason as the
          // hero — and only on desktop, where the pinned sequence reveals them.
          gsap.set(steps, { autoAlpha: 0, y: 24 });
          gsap.set("[data-step-rail]", { scaleX: 0 });

          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: "[data-pin-section]",
              start: "top top",
              end: () => `+=${steps.length * 60}%`,
              pin: true,
              scrub: 0.8,
              anticipatePin: 1,
            },
          });

          steps.forEach((step, index) => {
            const rail = step.querySelector("[data-step-rail]");

            timeline
              .to(
                step,
                { autoAlpha: 1, y: 0, duration: 0.5 },
                index * 0.9,
              )
              .to(rail, { scaleX: 1, duration: 0.5 }, index * 0.9)
              // Every step but the last recedes as the next arrives, so the
              // stack reads as one thing advancing rather than a pile.
              .to(
                step,
                { autoAlpha: index === steps.length - 1 ? 1 : 0.25, duration: 0.4 },
                index * 0.9 + 0.55,
              );
          });
        }
      },
    );

    return () => {
      window.removeEventListener("lm:preloader-done", playHero);
      window.clearTimeout(heroFallback);
      media.revert();
    };
  }, []);

  return <div ref={scope}>{children}</div>;
}
