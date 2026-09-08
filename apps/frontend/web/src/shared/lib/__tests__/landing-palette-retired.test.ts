import { describe, expect, it } from "vitest";

/**
 * The landing palette's local custom properties are gone, and nothing may
 * reference them again.
 *
 * `LANDING_VARS` supplied `--l-navy`, `--l-accent`, `--l-card`, `--l-muted`,
 * `--l-border` and `--l-band` as inline styles on the two page shells that
 * painted themselves rather than using tokens. Both shells moved onto the
 * home's rules on 2026-09-07 and the map was deleted with them.
 *
 * **This test exists because deleting it broke a page silently.** `ContactForm`
 * still asked for `var(--l-border)`, `var(--l-card)` and `var(--l-muted)` four
 * times over, and with nothing defining them the form lost its border and its
 * ground and its hint text fell back to inherit. Nothing failed: an undefined
 * custom property is not an error, it is an empty value. Typecheck passed,
 * lint passed, 2620 tests passed, and the form was broken on every screen.
 *
 * A missing CSS variable is only ever caught by looking for it, so looking for
 * it is a test. `import.meta.glob` rather than `fs`, matching every other
 * repo-wide check in this directory — it resolves against this file at build
 * time instead of against whatever directory the runner happens to be in.
 */
const SOURCES = import.meta.glob<string>("../../../**/*.{ts,tsx}", {
  // `as: "raw"` rather than `query`/`import`: this Vite build hands back
  // `undefined` for the latter, which reads as "no file matched" instead of
  // failing — exactly the silence this test exists to end.
  as: "raw",
  eager: true,
});

describe("the landing palette's local custom properties", () => {
  it("are referenced nowhere, because nothing defines them any more", () => {
    const offenders = Object.entries(SOURCES)
      // This file names them all, on purpose, so that the rule is readable.
      .filter(([path]) => !path.endsWith("landing-palette-retired.test.ts"))
      .map(([path, source]) => ({ path, hits: [...(source ?? "").matchAll(/--l-[a-z]+/g)].map((m) => m[0]) }))
      .filter(({ hits }) => hits.length > 0)
      .map(({ path, hits }) => `${path}: ${[...new Set(hits)].join(", ")}`);

    expect(offenders).toEqual([]);
  });

  /** The glob has to actually see the app, or this passes by reading nothing. */
  it("is looking at the whole of src", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(200);
    expect(Object.keys(SOURCES).some((p) => p.includes("company/ui/contact-form"))).toBe(true);
  });
});
