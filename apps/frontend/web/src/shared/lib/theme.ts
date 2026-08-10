export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "ntizo-theme";

/**
 * Reads the stored preference, defaulting to light.
 *
 * "system" would be the honest default — we do not know what someone wants
 * until they say — but it is the wrong one while the landing page is
 * light-only. Following the OS would turn the app dark around a light
 * marketing page for every visitor whose machine is in dark mode, and would
 * put a dark account menu on that light header, because the menu renders
 * through a portal to `document.body` and never sees the page's own colours.
 *
 * Dark stays available; it is opt-in until the landing has a dark
 * counterpart. See docs/superpowers/follow-ups.md entry 16.
 */
export function readThemePreference(): ThemePreference {
  if (typeof localStorage === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "light";
}

/** Resolves "system" against the OS setting; the other two answer for themselves. */
export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  if (typeof matchMedia === "undefined") return "light";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Applies a preference: toggles the `.dark` class the design tokens key off,
 * and stores the choice.
 *
 * `system` is removed from storage rather than written, so a user who picks
 * it goes back to having no stored opinion — which is what "follow the
 * system" means, and what a future default change should be free to affect.
 */
export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === "undefined") return;

  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  // Kept in step with the class so native controls — scrollbars, date
  // pickers, form widgets — match the page instead of staying dark.
  document.documentElement.style.colorScheme = resolved;

  if (typeof localStorage === "undefined") return;
  // "system" is stored rather than cleared, because the default is now light
  // rather than system — clearing it would silently mean "light", which is
  // not what the user picked.
  localStorage.setItem(STORAGE_KEY, preference);
}
