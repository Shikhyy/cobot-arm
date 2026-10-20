import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useReducedMotion } from "../three/useMotionPreference";

gsap.registerPlugin(ScrollTrigger);

let lenisInstance: Lenis | null = null;

/**
 * Smooth scrolling.
 *
 * Lenis is the ONLY smooth-scroll engine on the site. It is driven from the
 * GSAP ticker so ScrollTrigger and the smoothed scroll position never drift
 * apart, and it is destroyed on unmount.
 */
export function useLenis(enabled = true): void {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!enabled || reduced) return;

    const lenis = new Lenis({
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.6,
      anchors: { offset: -80, duration: 1.1 },
    });
    lenisInstance = lenis;

    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);

    return () => {
      window.removeEventListener("load", onLoad);
      gsap.ticker.remove(raf);
      lenis.off("scroll", onScroll);
      lenis.destroy();
      lenisInstance = null;
    };
  }, [enabled, reduced]);
}

export function scrollTo(target: string | HTMLElement, offset = -72): void {
  const element = typeof target === "string" ? document.querySelector(target) : target;
  if (!element) return;
  if (lenisInstance) {
    lenisInstance.scrollTo(element as HTMLElement, { offset, duration: 1.15 });
  } else {
    const top = (element as HTMLElement).getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top, behavior: "smooth" });
  }
}

export { gsap, ScrollTrigger };
