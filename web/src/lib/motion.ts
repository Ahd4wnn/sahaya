/**
 * GSAP, and the two questions every animated component asks first.
 *
 * There is no smooth-scroll library here. Lenis was tried and removed: even at
 * a near-native lerp it still means the page keeps moving after the wheel has
 * stopped, which costs precision on a page whose whole job is scanning a grid
 * of people. Native scrolling is the better default; GSAP drives the header
 * morph off the real scroll position instead.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Below this the morph degrades to a plain sticky bar. See docs/design.md 5. */
export const MORPH_MIN_WIDTH = 768;

export function morphEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return !prefersReducedMotion() && window.innerWidth >= MORPH_MIN_WIDTH;
}

/** Scroll to an element or offset, honouring the reduced-motion setting. */
export function scrollTo(target: string | number | HTMLElement, offset = 0) {
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";

  if (typeof target === "number") {
    window.scrollTo({ top: target + offset, behavior });
    return;
  }

  const element =
    typeof target === "string" ? document.querySelector(target) : target;
  if (!(element instanceof HTMLElement)) return;

  window.scrollTo({
    top: element.getBoundingClientRect().top + window.scrollY + offset,
    behavior,
  });
}
