import * as React from "react";

/**
 * Chart animations are pleasant and also the first thing to remove for someone
 * who has asked the OS for less motion.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}
