import { describe, expect, it } from "vitest";
import { Route } from "@/routes/__root";

/**
 * The document head, read off the real root route.
 *
 * The icon links are four object literals inside a file whose every other
 * edit is about providers, chrome and layout — and losing them is silent.
 * Nothing throws, no suite goes red, the app renders exactly as before; the
 * only symptom is the browser's blank default page icon back in the tab,
 * which is the kind of thing nobody notices until a screenshot goes out.
 *
 * The second half is the same failure one step along: a link whose `href` no
 * longer names a file under `public/` 404s, and the tab falls back to that
 * same blank icon. So the hrefs are checked against the directory rather than
 * against themselves.
 *
 * `import.meta.glob` rather than `node:fs` for that: it reads the directory
 * at transform time, through Vite's own resolution, and needs none of the
 * node types this package deliberately keeps out of a browser build. Left
 * lazy on purpose — only the keys are wanted, and eager would pull four
 * binaries through the asset pipeline to learn their names.
 */
const PUBLIC_FILES = new Set(
  Object.keys(import.meta.glob("../../../public/*")).map((path) =>
    path.replace("../../../public", ""),
  ),
);

/** `head()` is typed as awaitable; this one is not, and a test can say so. */
type HeadLink = { rel?: string; href?: string; type?: string };
const links = (Route.options.head?.({} as never) as { links?: HeadLink[] } | undefined)?.links ?? [];

const linkFor = (rel: string, href: string) =>
  links.find((link) => link.rel === rel && link.href === href);

describe("the root route's head", () => {
  it("declares the SVG favicon Chrome, Firefox and Edge prefer", () => {
    expect(linkFor("icon", "/favicon.svg")).toMatchObject({ type: "image/svg+xml" });
  });

  it("declares the .ico the browser asks for on its own", () => {
    expect(linkFor("icon", "/favicon.ico")).toBeDefined();
  });

  it("declares the larger PNG for a browser that cannot read the SVG", () => {
    expect(linkFor("icon", "/favicon-96.png")).toMatchObject({ type: "image/png" });
  });

  it("declares the touch icon iOS uses for a home-screen shortcut", () => {
    expect(linkFor("apple-touch-icon", "/apple-touch-icon.png")).toBeDefined();
  });

  it.each(["/favicon.svg", "/favicon.ico", "/favicon-96.png", "/apple-touch-icon.png"])(
    "ships %s in public/",
    (href) => {
      expect(PUBLIC_FILES).toContain(href);
    },
  );
});
