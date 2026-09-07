import { describe, expect, it } from "vitest";
import {
  CUSTOMER_QUOTE_TABS,
  PROVIDER_QUOTE_TABS,
  QUOTE_OPEN_STATUSES,
  QUOTE_STATUSES,
  quoteStatusSchema,
} from "../quote-enums";

describe("quote enums", () => {
  it("names the seven statuses, two of them open", () => {
    expect(QUOTE_STATUSES).toEqual([
      "REQUESTED", "PROPOSED", "ACCEPTED", "DECLINED", "REJECTED", "WITHDRAWN", "EXPIRED",
    ]);
    expect(QUOTE_OPEN_STATUSES).toEqual(["REQUESTED", "PROPOSED"]);
    expect(quoteStatusSchema.safeParse("PROPOSED").success).toBe(true);
    expect(quoteStatusSchema.safeParse("DRAFT").success).toBe(false);
  });

  it("names the tabs each side shows", () => {
    expect(CUSTOMER_QUOTE_TABS).toEqual(["open", "history"]);
    expect(PROVIDER_QUOTE_TABS).toEqual(["toAnswer", "waiting", "history"]);
  });
});
