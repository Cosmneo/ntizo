import { describe, expect, it } from "vitest";
// `?raw` rather than node:fs — this package is a browser bundle with no Node
// types in its tsconfig, so a `readFileSync` here fails `check-types` and
// `build` even though vitest would happily run it. The same reason
// `i18n-parity.test.ts` in the web app reaches for `import.meta.glob`.
import css from "../globals.css?raw";

/**
 * A token declared in `:root` and forgotten in `.dark` does not fall back to
 * anything sensible — it inherits the light value, so a dark page renders a
 * near-white surface where it expected a near-black one. Nothing else in the
 * build notices, and it is invisible to anybody developing in light mode,
 * which is everybody most of the time.
 */
const ADDED = [
  "--color-surface-raised",
  "--color-border-strong",
  "--color-primary-deep",
  "--shadow-xs",
  "--shadow-sm",
  "--shadow-lift",
  "--shadow-float",
];

/**
 * The body of a top-level block, by its selector.
 *
 * Brace-counted rather than regex-matched: `globals.css` contains nested
 * at-rules, and a regex for `\{([^}]*)\}` stops at the first inner brace and
 * silently reports half a block — which would make this whole suite pass on
 * a file it had only partly read.
 */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block not found`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`${selector} block never closed`);
}

describe("design tokens", () => {
  const root = block(":root");
  const dark = block(".dark");

  it("actually read the stylesheet", () => {
    // Without this the suite passes vacuously if the `?raw` import ever
    // resolves to an empty string — a green tick reporting that nothing was
    // compared.
    expect(css.length).toBeGreaterThan(1000);
    expect(root.length).toBeGreaterThan(100);
    expect(dark.length).toBeGreaterThan(100);
  });

  it.each(ADDED)("declares %s in :root", (token) => {
    expect(root).toContain(`${token}:`);
  });

  it.each(ADDED)("declares %s in .dark too", (token) => {
    expect(dark).toContain(`${token}:`);
  });

  it("keeps the display size in the type scale", () => {
    expect(css).toContain(".type-display");
  });

  it("does not silently change the brand blue", () => {
    // The redesign adds a deeper blue beside the brand one; it must not
    // replace it. Every other surface in the product reads --color-primary,
    // and none of them is part of this work.
    expect(root).toContain("--color-primary: #006ffd");
  });
});
