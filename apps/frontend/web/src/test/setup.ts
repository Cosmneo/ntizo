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
