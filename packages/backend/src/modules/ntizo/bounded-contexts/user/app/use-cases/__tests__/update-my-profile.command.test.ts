import { describe, expect, it } from "bun:test";
import { UpdateMyProfileCommand } from "../update-my-profile.command";
import { Profile } from "../../../domain/aggregates/profile.aggregate";
import {
  AvatarKeyNotOwnedError,
  InvalidPhoneNumberError,
  PhoneNumberAlreadyInUseError,
} from "../../../domain/exceptions";
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

/**
 * Same shape as `harness`, but the identity port always rejects and every
 * `save` call's phone number is recorded — as a snapshot at the moment of the
 * call, not the live aggregate reference, which `updateContact` goes on to
 * mutate in place after the compensating save — so a test can tell the
 * compensating write's value apart from the original one.
 */
function harnessWithFailingIdentity(
  profile: Profile,
  identityError: Error,
  options: { onSecondSave?: () => void } = {},
) {
  const saved: (string | null)[] = [];
  const command = new UpdateMyProfileCommand(
    {
      findByUserId: async () => profile,
      save: async (p: Profile) => {
        saved.push(p.phoneNumber);
        if (saved.length === 2) options.onSecondSave?.();
      },
    } as never,
    { atomicExecute: async (fn: () => Promise<void>) => fn() } as never,
    {
      setPhoneNumber: async () => {
        throw identityError;
      },
    },
  );
  return { command, saved };
}

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

  it("re-throws the identity port's error and restores the profile's prior phone number", async () => {
    const profile = Profile.create(base);
    profile.updateContact({ phoneNumber: "+258841234567" });
    const identityError = new PhoneNumberAlreadyInUseError();
    const { command, saved } = harnessWithFailingIdentity(profile, identityError);

    // The exact same error instance, not a different one about the revert —
    // the profile committed a phone the identity refused, but the failure
    // the user must see is the one the identity actually raised.
    await expect(command.execute(ctx, { phoneNumber: "+258849876543" })).rejects.toBe(
      identityError,
    );

    // Restored on the aggregate...
    expect(profile.phoneNumber).toBe("+258841234567");
    // ...and the restoration was actually persisted: the first save carried
    // the new (later-rejected) number, the second is the compensating write
    // putting the prior one back.
    expect(saved).toEqual(["+258849876543", "+258841234567"]);
  });

  it("still surfaces the original error when the compensating save itself fails", async () => {
    const profile = Profile.create(base);
    const identityError = new PhoneNumberAlreadyInUseError();
    const { command } = harnessWithFailingIdentity(profile, identityError, {
      onSecondSave: () => {
        throw new Error("database unreachable");
      },
    });

    // Not "database unreachable" — the caller must see the failure that
    // actually happened (the phone collision), not a different one produced
    // by the best-effort attempt to clean up after it.
    await expect(command.execute(ctx, { phoneNumber: "+258841234567" })).rejects.toBe(
      identityError,
    );
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

  it("refuses a key naming another user's namespace", async () => {
    const profile = Profile.create(base);
    const { command, saved } = harness(profile);

    await expect(
      command.execute(ctx, { avatarKey: "avatar/someone-else/1730000000000" }),
    ).rejects.toBeInstanceOf(AvatarKeyNotOwnedError);
    expect(saved).toEqual([]);
    expect(profile.avatarKey).toBeNull();
  });

  it("refuses a key whose prefix merely starts with the caller's id", async () => {
    const profile = Profile.create(base);
    const { command } = harness(profile);

    // "u1x" must not pass a check for "u1" just because the string starts
    // with the same characters — the trailing slash in the checked prefix is
    // what tells the two apart.
    await expect(command.execute(ctx, { avatarKey: "avatar/u1x/1" })).rejects.toBeInstanceOf(
      AvatarKeyNotOwnedError,
    );
  });
});
