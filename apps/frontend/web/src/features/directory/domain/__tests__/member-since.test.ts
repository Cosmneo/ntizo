import { describe, expect, it } from "vitest";
import { formatMemberSince } from "../member-since";

describe("formatMemberSince", () => {
  it("renders the month and year in the reader's language", () => {
    expect(formatMemberSince("2025-03", "pt-PT")).toBe("março de 2025");
    expect(formatMemberSince("2025-03", "en-US")).toBe("March 2025");
  });

  it("reads the month as civil, not as UTC shifted into the previous one", () => {
    // Built from a UTC midday and formatted in UTC. Parsing "2025-01" as a
    // local date in a negative-offset zone lands in December 2024.
    expect(formatMemberSince("2025-01", "en-US")).toBe("January 2025");
  });

  it("returns null for null", () => {
    expect(formatMemberSince(null, "pt-PT")).toBeNull();
  });

  it("returns null for a malformed value rather than an Invalid Date", () => {
    expect(formatMemberSince("2025", "pt-PT")).toBeNull();
    expect(formatMemberSince("2025-13", "pt-PT")).toBeNull();
    expect(formatMemberSince("not-a-date", "pt-PT")).toBeNull();
  });
});
