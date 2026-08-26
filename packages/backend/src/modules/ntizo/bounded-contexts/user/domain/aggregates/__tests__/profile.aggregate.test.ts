import { describe, expect, it } from "bun:test";
import { Profile } from "../profile.aggregate";
import { TimezoneInvalidError } from "../../exceptions";

const base = { userId: "u1", firstName: "Ana", lastName: "Sitoe" };

describe("Profile avatars", () => {
  it("is created with neither an avatar key nor an avatar url", () => {
    const profile = Profile.create(base);
    expect(profile.avatarKey).toBeNull();
    expect(profile.avatarUrl).toBeNull();
  });

  it("accepts an avatar url at creation, for the one Google supplies", () => {
    const profile = Profile.create({ ...base, avatarUrl: "https://lh3.googleusercontent.com/a/x" });
    expect(profile.avatarUrl).toBe("https://lh3.googleusercontent.com/a/x");
    // The key stays null: a Google photo is not ours and has no R2 key.
    expect(profile.avatarKey).toBeNull();
  });

  it("accepts a timezone at creation, and falls back to UTC without one", () => {
    expect(Profile.create({ ...base, timezone: "Africa/Maputo" }).timezone).toBe("Africa/Maputo");
    expect(Profile.create(base).timezone).toBe("UTC");
  });

  it("sets and clears the avatar key without disturbing the url", () => {
    const profile = Profile.create({ ...base, avatarUrl: "https://lh3.googleusercontent.com/a/x" });

    profile.updateContact({ avatarKey: "avatar/u1/1730000000000" });
    expect(profile.avatarKey).toBe("avatar/u1/1730000000000");
    expect(profile.avatarUrl).toBe("https://lh3.googleusercontent.com/a/x");

    profile.updateContact({ avatarKey: null });
    expect(profile.avatarKey).toBeNull();
    expect(profile.avatarUrl).toBe("https://lh3.googleusercontent.com/a/x");
  });

  it("leaves the avatar key alone when the key is absent from the update", () => {
    const profile = Profile.create(base);
    profile.updateContact({ avatarKey: "avatar/u1/1" });
    profile.updateContact({ bio: "Electrician" });
    expect(profile.avatarKey).toBe("avatar/u1/1");
  });
});

describe("Profile timezone", () => {
  it("create() falls back to UTC on a garbage timezone rather than throwing", () => {
    // Sign-up is not the moment to reject somebody over an `X-Timezone`
    // header they never typed — a bad value here must not break
    // registration.
    expect(Profile.create({ ...base, timezone: "Not/AZone" }).timezone).toBe("UTC");
    expect(Profile.create({ ...base, timezone: "" }).timezone).toBe("UTC");
  });

  it("create() honours a valid IANA timezone", () => {
    expect(Profile.create({ ...base, timezone: "Europe/Lisbon" }).timezone).toBe(
      "Europe/Lisbon",
    );
  });

  it("updatePreferences() refuses a garbage timezone, with TIMEZONE_INVALID, and keeps the prior value", () => {
    const profile = Profile.create({ ...base, timezone: "Africa/Maputo" });

    expect(() => profile.updatePreferences({ timezone: "Nowhere/Fake" })).toThrow(
      TimezoneInvalidError,
    );
    let code: string | undefined;
    try {
      profile.updatePreferences({ timezone: "Nowhere/Fake" });
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("TIMEZONE_INVALID");
    // Refused, not silently substituted: this is the person actually
    // asserting a choice, unlike the sign-up boundary above.
    expect(profile.timezone).toBe("Africa/Maputo");
  });

  it("updatePreferences() accepts a valid IANA timezone", () => {
    const profile = Profile.create(base);
    profile.updatePreferences({ timezone: "America/Sao_Paulo" });
    expect(profile.timezone).toBe("America/Sao_Paulo");
  });

  it("updatePreferences() leaves the timezone untouched when not supplied", () => {
    const profile = Profile.create({ ...base, timezone: "Europe/Lisbon" });
    profile.updatePreferences({ language: "pt-MZ" });
    expect(profile.timezone).toBe("Europe/Lisbon");
  });
});
