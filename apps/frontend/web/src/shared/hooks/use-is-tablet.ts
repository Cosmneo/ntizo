import { useEffect, useState } from "react";

const QUERY = "(min-width: 768px) and (max-width: 1023px)";

/**
 * The range between the console's two breakpoints, where the sidebar is
 * present but collapses to its icon rail by default. `useIsMobile` in the UI
 * package answers "below md"; this answers "between md and lg", and nothing
 * else in the console asks a third question.
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsTablet(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isTablet;
}
