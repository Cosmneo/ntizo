import { describe, expect, it } from "vitest";
import { lastPageOffset, waitedWording, waitingSince } from "../waiting";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe("waitingSince", () => {
  it("runs from the end of the appointment while nobody has closed it", () => {
    expect(waitingSince({ markedDoneAt: null, endsAt: "2026-09-01T10:00:00.000Z" })).toBe(
      "2026-09-01T10:00:00.000Z",
    );
  });

  it("runs from the moment it was marked done once somebody has", () => {
    expect(
      waitingSince({ markedDoneAt: "2026-09-03T08:00:00.000Z", endsAt: "2026-09-01T10:00:00.000Z" }),
    ).toBe("2026-09-03T08:00:00.000Z");
  });
});

describe("waitedWording", () => {
  it("counts whole minutes under the hour", () => {
    expect(waitedWording(ago(0), NOW, "pt-MZ")).toBe("0 min");
    expect(waitedWording(ago(59), NOW, "pt-MZ")).toBe("59 min");
  });

  it("counts whole hours from an hour to two days", () => {
    expect(waitedWording(ago(60), NOW, "pt-MZ")).toBe("1 h");
    expect(waitedWording(ago(6 * 60 + 7), NOW, "pt-MZ")).toBe("6 h");
    expect(waitedWording(ago(47 * 60 + 59), NOW, "pt-MZ")).toBe("47 h");
  });

  it("counts whole days from two days on", () => {
    expect(waitedWording(ago(48 * 60), NOW, "pt-MZ")).toBe("2 dias");
    expect(waitedWording(ago(9 * 24 * 60 + 60), NOW, "pt-MZ")).toBe("9 dias");
  });

  /**
   * The reason this takes a locale at all. A hardcoded "d" is not how French
   * or Italian abbreviate a day — `j` and `gg` — so the first revision printed
   * a unit letter that means nothing in two of the eight languages the app
   * ships. CLDR knows all eight.
   */
  it("abbreviates the unit the way each language does", () => {
    const twoDays = ago(48 * 60);
    expect(waitedWording(twoDays, NOW, "fr-FR")).toBe("2j");
    expect(waitedWording(twoDays, NOW, "it-IT")).toBe("2gg");
    expect(waitedWording(twoDays, NOW, "de-DE")).toBe("2 T");
    expect(waitedWording(twoDays, NOW, "nl-NL")).toBe("2 d");
    expect(waitedWording(twoDays, NOW, "en-US")).toBe("2d");
  });

  it("says nothing about a wait that has not started", () => {
    expect(waitedWording(new Date(NOW.getTime() + 60_000).toISOString(), NOW, "pt-MZ")).toBeNull();
  });

  it("says nothing about an instant that is not one", () => {
    expect(waitedWording("not a date", NOW, "pt-MZ")).toBeNull();
  });
});

describe("lastPageOffset", () => {
  it("stays on the first page while there is only one", () => {
    expect(lastPageOffset(0, 20)).toBe(0);
    expect(lastPageOffset(1, 20)).toBe(0);
    expect(lastPageOffset(20, 20)).toBe(0);
  });

  it("names the page the last row is on", () => {
    expect(lastPageOffset(21, 20)).toBe(20);
    expect(lastPageOffset(40, 20)).toBe(20);
    expect(lastPageOffset(41, 20)).toBe(40);
  });

  it("is one hop from any offset, however silly", () => {
    // Answering with the *last non-empty* page rather than "one page back" is
    // what keeps a correction from walking backwards a page at a time.
    expect(lastPageOffset(45, 20)).toBe(40);
    expect(lastPageOffset(-3, 20)).toBe(0);
    expect(lastPageOffset(21, 0)).toBe(0);
  });
});
