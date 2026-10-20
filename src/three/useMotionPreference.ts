import { useEffect, useState } from "react";

/** Tracks the user's reduced-motion preference and reacts to changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", handler);
    setReduced(query.matches);
    return () => query.removeEventListener("change", handler);
  }, []);

  return reduced;
}

/** True on coarse pointers (touch). */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  });

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const handler = (event: MediaQueryListEvent) => setCoarse(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return coarse;
}
