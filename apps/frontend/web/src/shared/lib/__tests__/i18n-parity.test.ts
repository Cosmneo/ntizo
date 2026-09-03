import { describe, expect, it } from "vitest";
import i18n from "@/shared/lib/i18n";

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

/**
 * The one place a namespace's *file* name and its i18next *key* diverge:
 * `become-provider.json` on disk, `becomeProvider` wherever the app calls
 * `useTranslation`/registers it in `i18n.ts` — every other namespace here is
 * one word, so the file name already is the key. A literal kebab-to-camel
 * conversion, not a lookup table naming that one file, so a second
 * multi-word namespace added later needs no edit here to be found correctly.
 */
const toI18nextNamespace = (fileName: string): string =>
  fileName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

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

  /**
   * Every check below compares one JSON file to another — it cannot see
   * whether the *application* ever loads the file it just compared.
   * `i18n.ts` imports every locale/namespace pair by hand into a `resources`
   * object passed to `i18next.init()`, and a namespace added after a
   * locale's own entry was last touched is an easy file to forget: exactly
   * one locale (`pt-MZ`) carried the `bookings` namespace from the day that
   * feature's list page landed, and the gap survived a full review cycle of
   * this branch, because nothing compared the files on disk to the object
   * `i18n.ts` actually built. A reader in any of the other seven locales got
   * the raw key ids (`tab.waiting`, `status.AWAITING_PROVIDER`) and
   * English-formatted money on every page this branch shipped, silently —
   * found only because an end-to-end test happened to load that page in a
   * browser (`apps/e2e/tests/customer-bookings.spec.ts`).
   *
   * `i18n.hasResourceBundle` is asked directly rather than re-reading
   * `i18n.ts`'s source: it is the same object i18next itself resolves a
   * `useTranslation(ns)` call against, so this fails on exactly the
   * condition a real reader would hit, not on a string this test would
   * otherwise have to keep in sync with the source file's own shape.
   */
  describe("every namespace on disk is registered in i18n.ts for every locale", () => {
    for (const locale of locales) {
      for (const ns of namespaces) {
        it(`${locale} registers the "${ns}" namespace`, () => {
          expect(
            i18n.hasResourceBundle(locale, toI18nextNamespace(ns)),
            `${ns}.json exists in locales/${locale}/ but i18n.ts's \`resources\` map never ` +
              `registers "${toI18nextNamespace(ns)}" for "${locale}" — every reader in this ` +
              `locale sees raw key ids and no formatting for whatever this namespace covers.`,
          ).toBe(true);
        });
      }
    }
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
   * The `booking_change.reason` vocabulary, and the one check every other
   * check in this file structurally cannot make.
   *
   * Everything above compares locale to locale, so a token missing from **all
   * eight** files passes with a green tick — and that is precisely the bug
   * this branch shipped three times. A command writes a reason; the page
   * renders it as ``t(`timeline.${reason}`)`` with a `defaultValue` of
   * "Estado alterado"; nothing anywhere connects the two. `cancelled_by_customer`
   * — the one write this feature exists to give a customer — reached both
   * zones as "Status changed", and `superseded_by_new_draft` was never
   * translated at all.
   *
   * The list below is the vocabulary a booking's history can actually
   * contain, and every member of it is written by a named producer:
   *
   * - `created_by_customer` — synthesised by `timelineOf`, not a row.
   * - `submitted_by_customer` — `SubmitBookingCommand`.
   * - `accepted_by_provider` — `AcceptBookingCommand`.
   * - `payment_confirmed` — `MarkBookingPaidCommand`.
   * - `declined_without_reason`, `not_available`, `cannot_perform`,
   *   `outside_area`, `other` — `DeclineBookingCommand` (`BOOKING_DECLINE_REASONS`).
   * - `provider_did_not_respond`, `checkout_hold_expired` — `SweepBookingCommand`.
   * - `superseded_by_new_draft` — `CreateBookingCommand`.
   * - `customer_did_not_pay` — `SweepBookingCommand`.
   * - `cancelled_by_customer` — `CancelBookingCommand`.
   * - `respond_by`, `pay_by` — synthesised deadlines, again from `timelineOf`.
   * - `unknown` — the `defaultValue` itself, which must exist for the
   *   fallback to be a sentence rather than a raw key.
   *
   * **A hand-kept list, and deliberately so.** The tokens live in
   * `packages/backend`'s use cases, which this browser bundle neither imports
   * nor can: they are a write-side vocabulary, and the only thing crossing to
   * the client is the string on a row already written. Copying it here, with
   * its producers named, is what makes adding a fifteenth reason a red test
   * in the zone that has to name it — rather than a fourth instance of a
   * customer being told "Estado alterado" about the one hop they caused
   * themselves.
   *
   * Both namespaces, because both audiences read the same list off the same
   * rows: `bookings.timeline` for the customer, `provider.bookings.timelineReason`
   * for the provider.
   */
  describe("every booking_change reason has a word in both zones", () => {
    const REASONS = [
      "created_by_customer",
      "submitted_by_customer",
      "accepted_by_provider",
      "payment_confirmed",
      "declined_without_reason",
      "not_available",
      "cannot_perform",
      "outside_area",
      "other",
      "provider_did_not_respond",
      "checkout_hold_expired",
      "superseded_by_new_draft",
      "customer_did_not_pay",
      "cancelled_by_customer",
      "respond_by",
      "pay_by",
      "unknown",
    ] as const;

    const ZONES = [
      { ns: "bookings", path: "timeline" },
      { ns: "provider", path: "bookings.timelineReason" },
    ] as const;

    for (const locale of locales) {
      for (const { ns, path } of ZONES) {
        it(`${locale}/${ns}.${path} names every reason`, () => {
          const keys = new Set(leafKeys(find(locale, ns)));
          const missing = REASONS.filter((reason) => !keys.has(`${path}.${reason}`));
          expect(
            missing,
            `${locale}/${ns}.json has no word for ${missing.join(", ")} — a booking ` +
              `carrying one of those reasons renders as the fallback hop instead.`,
          ).toEqual([]);
        });
      }
    }
  });

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
