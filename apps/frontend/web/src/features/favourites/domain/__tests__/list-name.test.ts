import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { DEFAULT_LIST_NAME_KEY, listDisplayName } from "../list-name";

/**
 * A `t` that answers **only** `DEFAULT_LIST_NAME_KEY`, and marks anything else
 * as a miss.
 *
 * Not laziness, and not a stub that echoes its key back: the domain layer may
 * not import `@/shared/lib/i18n` at all (the boundaries policy allows
 * `domain -> domain` and nothing else), so the app's initialised i18next
 * instance is out of reach here by design. What this shape still catches is
 * the thing that can actually break — asking for a *different* key than the
 * one the locale files carry, e.g. dropping the `common:` namespace
 * qualification and resolving against whatever namespace the caller happened
 * to hold. A key this stub does not know reads back `?<key>`, so the first
 * test below fails loudly instead of quietly passing.
 *
 * The other end of the chain — that `common:favouritesDefaultList` genuinely
 * resolves to "Favourites" out of the real `en-US` bundle, through a `t` bound
 * to a different namespace — is asserted where it can be:
 * `viewmodel/__tests__/use-lists.test.tsx` renders a list row through
 * `useTranslation`.
 */
const t = ((key: string) =>
  key === DEFAULT_LIST_NAME_KEY ? "Favourites" : `?${key}`) as unknown as TFunction;

describe("listDisplayName", () => {
  it("translates the default list's name rather than storing it", () => {
    // The same list reads Favoritos to one person and Favourites to another.
    expect(listDisplayName({ name: null, isDefault: true }, t)).toBe("Favourites");
  });

  it("uses the stored name once somebody has renamed the default", () => {
    expect(listDisplayName({ name: "A minha lista", isDefault: true }, t)).toBe(
      "A minha lista",
    );
  });

  it("uses the stored name on every other list", () => {
    expect(listDisplayName({ name: "Casa nova", isDefault: false }, t)).toBe("Casa nova");
  });

  it("does not fall back to the default's name for a nameless non-default list", () => {
    // Unreachable through the API, but a defensive read must not label a
    // stranger row "Favourites" and put it beside the real one.
    expect(listDisplayName({ name: null, isDefault: false }, t)).not.toBe("Favourites");
  });

  it("treats a blank stored name as no name at all", () => {
    // The server trims before storing, so this can only arrive from a row
    // written before that rule existed — a heading of one space is worse than
    // either honest answer.
    expect(listDisplayName({ name: "   ", isDefault: true }, t)).toBe("Favourites");
    expect(listDisplayName({ name: "   ", isDefault: false }, t)).toBe("");
  });
});
