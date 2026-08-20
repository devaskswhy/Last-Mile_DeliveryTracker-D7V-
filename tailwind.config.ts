import type { Config } from "tailwindcss";

import { DURATION, EASE, MOBILE_BREAKPOINT } from "./src/lib/motion/tokens";

/**
 * The design system.
 *
 * One accent, one easing curve, one type scale. The accent is imported nowhere
 * as a raw hex — everything references `signal`, so changing the identity is a
 * one-line edit rather than a search across the codebase.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Kept for the existing internal pages, which follow the OS theme.
        background: "var(--background)",
        foreground: "var(--foreground)",

        /**
         * THE accent. Hi-vis lime — the colour of a courier's vest and a road
         * sign, so it reads as this domain rather than as generic software, and
         * it carries roughly 15:1 contrast on the ink base.
         *
         * There is no second accent. States that would normally reach for one
         * (danger, success) are handled with weight, opacity and the neutral
         * ramp instead.
         */
        signal: {
          DEFAULT: "#D6FF3D",
          /** The accent at low alpha, for tinted surfaces. Same hue. */
          wash: "rgba(214, 255, 61, 0.08)",
        },

        /** The dark base and its neutral ramp. */
        ink: {
          DEFAULT: "#08090A",
          soft: "#0F1113",
          raised: "#16191C",
          line: "#242A2E",
          muted: "#7C8792",
          bright: "#F2F5F3",
        },
      },

      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },

      /**
       * A display scale with real jumps between steps. Timid type is what makes
       * an interface look like an admin panel; the headline sizes here are
       * deliberately far from the body sizes.
       */
      fontSize: {
        "display-lg": ["clamp(3.5rem, 12vw, 11rem)", { lineHeight: "0.86", letterSpacing: "-0.045em", fontWeight: "600" }],
        "display": ["clamp(2.75rem, 8vw, 6.5rem)", { lineHeight: "0.9", letterSpacing: "-0.04em", fontWeight: "600" }],
        "headline": ["clamp(1.75rem, 4vw, 3.25rem)", { lineHeight: "1.02", letterSpacing: "-0.03em", fontWeight: "600" }],
        "title": ["clamp(1.25rem, 2vw, 1.75rem)", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "500" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        "body": ["1rem", { lineHeight: "1.65" }],
        "caption": ["0.8125rem", { lineHeight: "1.5", letterSpacing: "0.01em" }],
        "eyebrow": ["0.6875rem", { lineHeight: "1", letterSpacing: "0.18em", fontWeight: "500" }],
      },

      /** Section rhythm — a few large steps rather than many small ones. */
      spacing: {
        section: "clamp(6rem, 14vh, 11rem)",
        gutter: "clamp(1.25rem, 5vw, 5rem)",
      },

      maxWidth: {
        shell: "88rem",
        prose: "42rem",
      },

      transitionTimingFunction: {
        // The one curve, from the same four numbers GSAP uses.
        signature: `cubic-bezier(${EASE.join(", ")})`,
      },

      transitionDuration: {
        fast: `${DURATION.fast * 1000}ms`,
        base: `${DURATION.base * 1000}ms`,
        slow: `${DURATION.slow * 1000}ms`,
      },

      screens: {
        motion: `${MOBILE_BREAKPOINT}px`,
      },

      keyframes: {
        marquee: {
          from: { transform: "translate3d(0, 0, 0)" },
          to: { transform: "translate3d(-50%, 0, 0)" },
        },
      },
      animation: {
        marquee: "marquee 40s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
