import { describe, expect, it } from "bun:test";
import { UpdateMyProfileCommand } from "../update-my-profile.command";
import { Profile } from "../../../domain/aggregates/profile.aggregate";
import { InvalidPhoneNumberError } from "../../../domain/exceptions";
import type { ExecutionContext } from "../../../../../shared/infrastructure/execution-context";

// A full, valid ExecutionContext rather than the minimal shape a cast could
// paper over: `requireAuthenticated` inspects `requester.type` at runtime, so
// a shortcut here would fail every test before the command under test ever
// runs.
const ctx = {
  requester: {
    type: "authenticated",
    user: {
      userId: "u1",
      email: "ana@ntizo.test",
      firstName: "Ana",
      lastName: "Sitoe",
      platformRole: "customer",
    },
  },
  metadata: {
    requestId: "req-1",
    receivedAt: new Date(),
  },
} as unknown as ExecutionContext;

function harness(profile: Profile) {
  const saved: Profile[] = [];
  const identityCalls: (string | null)[] = [];
  const command = new UpdateMyProfileCommand(
    {
      findByUserId: async () => profile,
      save: async (p: Profile) => {
        saved.push(p);
      },
    } as never,
    { atomicExecute: async (fn: () => Promise<void>) => fn() } as never,
    {
      setPhoneNumber: async (_userId: string, phoneNumber: string | null) => {
        identityCalls.push(phoneNumber);
      },
    },
  );
  return { command, saved, identityCalls };
}

const base = { userId: "u1", firstName: "Ana", lastName: "Sitoe" };

describe("UpdateMyProfileCommand — phone", () => {
  it("normalises to E.164 and pushes the same string to the auth identity", async () => {
    const profile = Profile.create(base);
    const { command, identityCalls } = harness(profile);

    await command.execute(ctx, { phoneNumber: "+258 84 123 4567" });

    expect(profile.phoneNumber).toBe("+258841234567");
    // The same string in both places, or the unique index protects nothing.
    expect(identityCalls).toEqual(["+258841234567"]);
  });

  it("does not touch the auth identity when the number is unchanged", async () => {
    const profile = Profile.create(base);
    profile.updateContact({ phoneNumber: "+258841234567" });
    const { command, identityCalls } = harness(profile);

    // Saving the form without touching the phone must not clear a
    // verification the person already went through.
    await command.execute(ctx, { phoneNumber: "+258841234567", bio: "Electrician" });

    expect(identityCalls).toEqual([]);
    expect(profile.bio).toBe("Electrician");
  });

  it("clears the number in both places when given null", async () => {
    const profile = Profile.create(base);
    profile.updateContact({ phoneNumber: "+258841234567" });
    const { command, identityCalls } = harness(profile);

    await command.execute(ctx, { phoneNumber: null });

    expect(profile.phoneNumber).toBeNull();
    expect(identityCalls).toEqual([null]);
  });

  it("refuses an invalid number before writing anything", async () => {
    const profile = Profile.create(base);
    const { command, saved, identityCalls } = harness(profile);

    await expect(command.execute(ctx, { phoneNumber: "841234567" })).rejects.toBeInstanceOf(
      InvalidPhoneNumberError,
    );
    expect(saved).toEqual([]);
    expect(identityCalls).toEqual([]);
  });
});

describe("UpdateMyProfileCommand — avatar", () => {
  it("sets and clears the avatar key", async () => {
    const profile = Profile.create(base);
    const { command } = harness(profile);

    await command.execute(ctx, { avatarKey: "avatar/u1/1" });
    expect(profile.avatarKey).toBe("avatar/u1/1");

    await command.execute(ctx, { avatarKey: null });
    expect(profile.avatarKey).toBeNull();
  });
});
