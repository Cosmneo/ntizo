import { describe, expect, it } from "vitest";
import { waitedWording, waitingSince } from "../waiting";

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
    expect(waitedWording(ago(0), NOW)).toBe("0 min");
    expect(waitedWording(ago(59), NOW)).toBe("59 min");
  });

  it("counts whole hours from an hour to two days", () => {
    expect(waitedWording(ago(60), NOW)).toBe("1 h");
    expect(waitedWording(ago(6 * 60 + 7), NOW)).toBe("6 h");
    expect(waitedWording(ago(47 * 60 + 59), NOW)).toBe("47 h");
  });

  it("counts whole days from two days on", () => {
    expect(waitedWording(ago(48 * 60), NOW)).toBe("2 d");
    expect(waitedWording(ago(9 * 24 * 60 + 60), NOW)).toBe("9 d");
  });

  it("says nothing about a wait that has not started", () => {
    expect(waitedWording(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBeNull();
  });

  it("says nothing about an instant that is not one", () => {
    expect(waitedWording("not a date", NOW)).toBeNull();
  });
});
