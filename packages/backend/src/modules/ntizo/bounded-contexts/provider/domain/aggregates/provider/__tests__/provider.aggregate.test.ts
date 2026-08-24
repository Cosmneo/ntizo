import { describe, expect, it } from "bun:test";
import { Provider } from "../provider.aggregate";
import { TimezoneInvalidError } from "../../../exceptions";

function built(overrides: Partial<Parameters<typeof Provider.create>[0]> = {}) {
  return Provider.create({
    id: "provider-1",
    ownerUserId: "owner-1",
    type: "individual",
    name: "Ana's Cleaning",
    slug: "anas-cleaning",
    commissionBps: 1000,
    ...overrides,
  });
}

describe("Provider — timezone", () => {
  it("defaults to Africa/Maputo when create() is not given one, matching the DB column's own default", () => {
    expect(built().timezone).toBe("Africa/Maputo");
  });

  it("create() accepts an explicit timezone", () => {
    expect(built({ timezone: "Europe/Lisbon" }).timezone).toBe("Europe/Lisbon");
  });

  it("update() replaces the timezone with a valid IANA zone", () => {
    const provider = built();
    provider.update({ timezone: "America/Sao_Paulo" });
    expect(provider.timezone).toBe("America/Sao_Paulo");
  });

  it("update() leaves the timezone untouched when not supplied", () => {
    const provider = built({ timezone: "Europe/Lisbon" });
    provider.update({ name: "New name" });
    expect(provider.timezone).toBe("Europe/Lisbon");
  });

  it("update() refuses a string that is not a real IANA timezone, with TIMEZONE_INVALID", () => {
    const provider = built();
    expect(() => provider.update({ timezone: "Nowhere/Fake" })).toThrow(TimezoneInvalidError);
    let code: string | undefined;
    try {
      provider.update({ timezone: "Nowhere/Fake" });
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("TIMEZONE_INVALID");
    // Refused, not silently ignored: the prior valid value survives.
    expect(provider.timezone).toBe("Africa/Maputo");
  });
});
