/**
 * The FAQ's shape: which categories exist, in which order, and which
 * questions sit under each.
 *
 * Ids here, words in the `help` namespace (`faq.<category>.<question>.q|a`).
 * Two reasons: the panel and `/help` render the same twenty answers and must
 * not drift, and the i18n parity test then guards the copy in all eight
 * locales the way it guards every other namespace.
 *
 * The text is the approved copy in
 * `docs/superpowers/specs/2026-09-02-faq-content.md` — pt-MZ and en-US
 * authored, the other six falling back to en-US per key through
 * `i18n.ts`'s `fallbackLng` map. Ids are minted here because that document
 * numbers its questions and does not name them.
 */
export interface FaqCategory {
  readonly id: string;
  readonly questionIds: readonly string[];
}

export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  {
    id: "customers",
    questionIds: [
      "howBookingWorks",
      "whenIPay",
      "paymentMethods",
      "priceIsPrice",
      "verifiedBadge",
      "quoteAndHourly",
      "cancelBooking",
      "leaveReview",
    ],
  },
  {
    id: "providers",
    questionIds: [
      "whoCanBe",
      "whatItCosts",
      "whenPaid",
      "verification",
      "team",
      "availability",
      "noAnswer",
    ],
  },
  {
    id: "payments",
    questionIds: [
      "paymentDataStored",
      "shareContact",
      "serviceNotDone",
      "dataHandling",
      "deleteAccount",
    ],
  },
] as const;

/**
 * The four the panel's home screen offers before anyone searches — the
 * questions support actually receives, not the first four in order.
 */
export const POPULAR_QUESTION_IDS: readonly string[] = [
  "whenIPay",
  "paymentMethods",
  "cancelBooking",
  "whenPaid",
] as const;

/** One question with its words resolved — what search and the accordion both take. */
export interface FaqEntry {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
}
