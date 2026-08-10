/**
 * The landing page's colours, taken from the design system.
 *
 * This module exists because the page composes with inline styles and canvas
 * artwork, neither of which can read a Tailwind class. The values are the
 * system's, not the page's own — if they ever diverge, this file is wrong,
 * not globals.css.
 */
export const NAVY = "#13171b"; // Dark Text
export const ACCENT = "#006ffd"; // Brand Blue
export const CARD = "#ffffff"; // White
export const MUTED = "#71727a"; // Grey Text
export const BORDER = "#e5e5e5"; // Border

/**
 * Tint Blue BG, used for the page ground and as the fill the hero's wave
 * rises into. One value rather than the three-stop gradient the page used to
 * carry — the system has a single soft background, not a ramp.
 */
export const PAGE_TOP = "#f2f8fe";
export const PAGE_MID = "#f2f8fe";
export const PAGE_BOTTOM = "#f2f8fe";
