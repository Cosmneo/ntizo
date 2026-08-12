/**
 * Registers `jest-dom`'s matchers (`toBeChecked`, `toHaveAccessibleDescription`,
 * …) before any test runs. Without this the assertions in component tests
 * would fail on `expect(...).toBeChecked` not being a function rather than on
 * the thing they're actually checking.
 *
 * The web app's setup also boots i18n, because its components read copy
 * through `useTranslation`. This kit ships no copy of its own — every string
 * is a prop — so there is nothing here to initialise.
 */
import "@testing-library/jest-dom/vitest";
