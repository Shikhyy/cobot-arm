import { useEffect } from "react";
import { gsap, ScrollTrigger } from "./useLenis";
import { director } from "../three/director";
import { useReducedMotion } from "../three/useMotionPreference";

/**
 * Binds the page scroll to the 3D camera.
 *
 * The ScrollTrigger writes into a plain mutable object (`director`) rather
 * than React state, so scrolling never triggers a render. The camera rig reads
 * the value inside `useFrame`.
 */
export function useScrollDirector(scope: React.RefObject<HTMLElement>, enabled = true): void {
  const reduced = useReducedMotion();

  useEffect(() => {
    const root = scope.current;
    if (!root || !enabled) return;

    const ctx = gsap.context(() => {
      if (reduced) {
        director.progress = 0;
        return;
      }

      ScrollTrigger.create({
        trigger: root,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.8,
        onUpdate: (self) => {
          director.progress = self.progress;
        },
      });
    }, root);

    return () => ctx.revert();
  }, [scope, enabled, reduced]);
}
