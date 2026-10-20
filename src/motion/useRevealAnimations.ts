import { useEffect } from "react";
import { gsap, ScrollTrigger } from "./useLenis";
import { useReducedMotion } from "../three/useMotionPreference";

/**
 * Cinematic reveal system.
 *
 * Everything is scoped in a `gsap.context()` so that leaving the page reverts
 * every tween, ScrollTrigger and inline style it created. Nothing here ever
 * touches the robot state — GSAP is presentation only.
 */

function splitWords(element: HTMLElement): HTMLElement[] {
  if (element.dataset.splitReady === "true") {
    return Array.from(element.querySelectorAll<HTMLElement>(".split-word"));
  }
  const text = element.textContent ?? "";
  const parts = text.split(/(\s+)/);
  element.textContent = "";
  element.setAttribute("aria-label", text.trim());

  const words: HTMLElement[] = [];
  parts.forEach((part) => {
    if (!part.trim()) {
      element.appendChild(document.createTextNode(part));
      return;
    }
    const mask = document.createElement("span");
    mask.className = "split-word-mask";
    const word = document.createElement("span");
    word.className = "split-word";
    word.textContent = part;
    mask.setAttribute("aria-hidden", "true");
    mask.appendChild(word);
    element.appendChild(mask);
    words.push(word);
  });
  element.dataset.splitReady = "true";
  return words;
}

export function useRevealAnimations(scope: React.RefObject<HTMLElement>, enabled = true): void {
  const reduced = useReducedMotion();

  useEffect(() => {
    const root = scope.current;
    if (!root || !enabled) return;

    const ctx = gsap.context(() => {
      if (reduced) {
        gsap.set("[data-reveal], [data-reveal-item], [data-motion-text]", {
          autoAlpha: 1,
          clearProps: "all",
        });
        return;
      }

      /* 1 — masked word reveals ----------------------------------- */
      gsap.utils.toArray<HTMLElement>("[data-motion-text='words']").forEach((element) => {
        const words = splitWords(element);
        gsap.set(element, { autoAlpha: 1 });
        gsap.fromTo(
          words,
          { yPercent: 112, autoAlpha: 0, filter: "blur(7px)" },
          {
            yPercent: 0,
            autoAlpha: 1,
            filter: "blur(0px)",
            duration: 0.95,
            ease: "power4.out",
            stagger: 0.048,
            scrollTrigger: { trigger: element, start: "top 84%", once: true },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-motion-text='lines']").forEach((element) => {
        const lines = element.querySelectorAll<HTMLElement>(".reveal-line");
        const targets = lines.length ? lines : Array.from(element.children);
        gsap.set(element, { autoAlpha: 1 });
        gsap.fromTo(
          targets,
          { yPercent: 104, autoAlpha: 0, filter: "blur(6px)" },
          {
            yPercent: 0,
            autoAlpha: 1,
            filter: "blur(0px)",
            duration: 1,
            ease: "power4.out",
            stagger: 0.09,
            scrollTrigger: { trigger: element, start: "top 86%", once: true },
          },
        );
      });

      /* 2 — section reveals --------------------------------------- */
      gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
        const items = group.querySelectorAll<HTMLElement>("[data-reveal-item]");
        if (!items.length) return;
        gsap.set(group, { autoAlpha: 1 });
        gsap.fromTo(
          items,
          { y: 34, autoAlpha: 0, filter: "blur(8px)" },
          {
            y: 0,
            autoAlpha: 1,
            filter: "blur(0px)",
            duration: 0.95,
            ease: "power4.out",
            stagger: 0.075,
            scrollTrigger: { trigger: group, start: "top 84%", once: true },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal]:not([data-reveal-item])").forEach((element) => {
        gsap.set(element, { autoAlpha: 1 });
        gsap.fromTo(
          element,
          { y: 30, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.9,
            ease: "power4.out",
            delay: Number(element.dataset.revealDelay || 0),
            scrollTrigger: { trigger: element, start: "top 86%", once: true },
          },
        );
      });

      /* 3 — clip reveals ------------------------------------------ */
      gsap.utils.toArray<HTMLElement>("[data-clip-reveal]").forEach((figure) => {
        gsap.set(figure, { autoAlpha: 1 });
        gsap.fromTo(
          figure,
          { clipPath: "inset(0% 0% 100% 0%)" },
          {
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 1.1,
            ease: "power4.out",
            scrollTrigger: { trigger: figure, start: "top 84%", once: true },
          },
        );
      });

      /* 4 — subtle parallax --------------------------------------- */
      gsap.utils.toArray<HTMLElement>("[data-parallax-layer]").forEach((layer) => {
        const speed = Number(layer.dataset.parallaxSpeed || -0.1);
        const section = layer.closest<HTMLElement>("[data-parallax-section]") ?? layer;
        gsap.to(layer, {
          y: () => window.innerHeight * speed,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top bottom",
            end: "bottom top",
            scrub: 1.1,
            invalidateOnRefresh: true,
          },
        });
      });
    }, root);

    ScrollTrigger.refresh();

    return () => {
      ctx.revert();
    };
  }, [scope, enabled, reduced]);
}
