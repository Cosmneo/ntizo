import { describe, expect, it } from "vitest";

/**
 * Loaded through Vite's glob import rather than `node:fs`. This app is a
 * browser bundle and its tsconfig carries no Node types, so a `readFileSync`
 * here fails `check-types` and `build` even though vitest would run it. The
 * glob also means a new locale directory is picked up with no edit to this
 * file — which matters, because a parity gate that has to be told about a new
 * language is the one thing it must not be.
 */
const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/*.json", {
  eager: true,
  import: "default",
});

const REFERENCE = "en-US";

interface Entry {
  locale: string;
  namespace: string;
  data: Record<string, unknown>;
}

const entries: Entry[] = Object.entries(modules).map(([path, data]) => {
  const [, locale, file] = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/) ?? [];
  return { locale: locale!, namespace: file!, data };
});

const locales = [...new Set(entries.map((e) => e.locale))].sort();
const namespaces = [...new Set(entries.map((e) => e.namespace))].sort();
const find = (locale: string, namespace: string) =>
  entries.find((e) => e.locale === locale && e.namespace === namespace)?.data;

/** Every leaf key, dotted — `nav.platform`, not `nav`. */
function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

/** Interpolation placeholders per leaf key, e.g. `{ verificationSent: ["email"] }`. */
function placeholders(value: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (node: unknown, prefix: string): void => {
    if (typeof node === "string") {
      out[prefix] = [...node.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).sort();
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  walk(value, "");
  return out;
}

/**
 * Seven languages across four namespaces drift silently: a key added to `en`
 * and forgotten elsewhere renders as the raw key id to real users, and nothing
 * else in the build notices.
 */
describe("locale parity", () => {
  it("actually has locales to compare", () => {
    // Without this the suite passes vacuously if the glob stops matching —
    // a green tick reporting that nothing was compared.
    expect(locales).toContain(REFERENCE);
    expect(locales.length).toBeGreaterThan(1);
    expect(namespaces.length).toBeGreaterThan(0);
  });

  for (const locale of locales.filter((l) => l !== REFERENCE)) {
    for (const ns of namespaces) {
      it(`${locale}/${ns} has exactly the keys ${REFERENCE}/${ns} has`, () => {
        const reference = find(REFERENCE, ns);
        const actual = find(locale, ns);
        expect(reference, `${REFERENCE}/${ns} is missing`).toBeDefined();
        expect(actual, `${locale}/${ns} is missing`).toBeDefined();
        expect(leafKeys(actual).sort()).toEqual(leafKeys(reference).sort());
      });
    }
  }

  /**
   * A dropped placeholder is worse than a missing key: the string still
   * renders, just with the value silently gone — `We sent a link to .`
   */
  for (const locale of locales) {
    for (const ns of namespaces) {
      it(`${locale}/${ns} preserves every interpolation placeholder`, () => {
        expect(placeholders(find(locale, ns))).toEqual(placeholders(find(REFERENCE, ns)));
      });
    }
  }

  /**
   * Every check above only ever compares one locale's shape to another's —
   * never a locale's own content against itself. Two failures that
   * agreement can never see:
   *
   * - Two different keys landing on the exact same sentence by copy-paste.
   *   Every locale still agrees with every other locale on which sentence
   *   goes with which key, so nothing above would ever notice.
   * - A `{{placeholder}}` whose name nobody actually supplies at the call
   *   site. See `features/messaging/viewmodel/__tests__/messaging-payload-interpolation.test.ts`
   *   for that half — proving it needs a real render, the same technique
   *   `activity-payload-interpolation.test.ts` already established for a
   *   different namespace, not another round of comparing JSON to JSON.
   *
   * Scoped to `messaging` — the one namespace this task wrote — rather than
   * every namespace the app ships. Turning the first check loose on the
   * existing namespaces reds immediately on legitimate reuse that predates
   * this task: `account.json`'s top-level `cancel` and its `crop.cancel`
   * both render "Cancel", correctly — a crop dialog's cancel button says the
   * same word as every other cancel button on the site. Auditing the
   * existing namespaces for that is a different task's call to make.
   */
  describe("messaging: a locale's own content, checked against itself", () => {
    const NS = "messaging";

    for (const locale of locales) {
      it(`${locale}/${NS}: no two keys share a value`, () => {
        const data = find(locale, NS);
        expect(data, `${locale}/${NS} is missing`).toBeDefined();

        const keysByValue = new Map<string, string[]>();
        const walk = (node: unknown, prefix: string): void => {
          if (typeof node === "string") {
            keysByValue.set(node, [...(keysByValue.get(node) ?? []), prefix]);
            return;
          }
          if (typeof node !== "object" || node === null) return;
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            walk(v, prefix ? `${prefix}.${k}` : k);
          }
        };
        walk(data, "");

        const duplicates = [...keysByValue.entries()].filter(([, keys]) => keys.length > 1);
        expect(duplicates, `duplicate values in ${locale}/${NS}: ${JSON.stringify(duplicates)}`).toEqual([]);
      });
    }
  });
});
