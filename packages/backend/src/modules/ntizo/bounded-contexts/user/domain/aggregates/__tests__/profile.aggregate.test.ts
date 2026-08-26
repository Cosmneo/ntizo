import { describe, expect, it } from "bun:test";
import { Profile } from "../profile.aggregate";

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
