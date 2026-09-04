import "@testing-library/jest-dom/vitest";

/**
 * Initialise i18n for every component test.
 *
 * Without this, `useTranslation` has no resources and `t("heroLine1")` renders
 * the key itself. Tests then either assert on raw key ids — which passes while
 * proving nothing about what a user sees — or break the moment a hardcoded
 * string is moved behind a translation, which is exactly what happened to the
 * landing test.
 *
 * The detector resolves to `en` here (jsdom's navigator language), so
 * assertions read the English copy, and any locale whose key set has drifted
 * is caught separately by the parity gate.
 */
import "@/shared/lib/i18n";

/**
 * jsdom implements no layout, so it ships no `scrollIntoView` at all — the
 * property is undefined rather than a no-op, and any component that keeps a
 * highlighted item in view throws on mount.
 *
 * Stubbed here rather than guarded at each call site: the method exists in
 * every browser, so an optional call in component code would be dead weight
 * bought purely to satisfy the test environment.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/**
 * jsdom ships no `IntersectionObserver` either — for the same reason, since
 * whether an element is on screen is a layout question and jsdom does no
 * layout. Constructing one throws, which takes down any component that
 * watches for something scrolling into view (`NotificationsPage`'s bottom of
 * list, `settings-nav`'s current section).
 *
 * Stubbed inert on purpose: it never reports anything as visible, so the
 * default for a suite with no viewport is "the reader has not scrolled
 * there". A test that means to assert what happens when they do replaces
 * this global with one that calls its own callback — `notifications-page-
 * paging.test.tsx` does exactly that — rather than inheriting a scroll
 * position it never chose. Same reasoning as the `matchMedia` stub below.
 */
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

/**
 * jsdom implements no media queries either, so `window.matchMedia` is undefined
 * and any component that asks whether it is on a phone throws on mount.
 *
 * Stubbed as "no query matches", which resolves `useIsMobile()` to `false` — the
 * wide layout. That is the right default for a suite with no viewport: a test
 * that means to assert the phone layout has to say so, by replacing this stub
 * with one that matches, rather than inheriting a breakpoint it never chose.
 */
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
