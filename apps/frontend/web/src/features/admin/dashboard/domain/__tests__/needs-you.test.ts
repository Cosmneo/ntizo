import { describe, expect, it } from "vitest";
import { needsYou } from "../needs-you";

describe("needsYou", () => {
  it("shows the first three sources above zero, in priority order", () => {
    expect(needsYou({ disputed: 2, providers: 4, support: 1, contact: 3 })).toEqual([
      { key: "disputed", count: 2 },
      { key: "providers", count: 4 },
      { key: "support", count: 1 },
    ]);
  });

  it("lets a lower source in when a higher one is quiet", () => {
    expect(needsYou({ disputed: 0, providers: 4, support: 0, contact: 3 })).toEqual([
      { key: "providers", count: 4 },
      { key: "contact", count: 3 },
    ]);
  });

  it("shows nothing on a quiet day, and nothing for a count that has not arrived", () => {
    expect(needsYou({ disputed: 0, providers: 0, support: 0, contact: 0 })).toEqual([]);
    expect(needsYou({ disputed: undefined, providers: undefined })).toEqual([]);
  });
});
