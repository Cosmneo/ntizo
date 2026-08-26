import { describe, expect, it } from "bun:test";
import { BetterAuthIdentityAdapter } from "../better-auth-identity.adapter";
import { PhoneNumberAlreadyInUseError } from "../../../domain/exceptions";

describe("BetterAuthIdentityAdapter", () => {
  it("writes the number and clears the verified flag in one update", async () => {
    const calls: { userId: string; phoneNumber: string | null; verified: boolean }[] = [];
    const adapter = new BetterAuthIdentityAdapter(async (userId, phoneNumber, verified) => {
      calls.push({ userId, phoneNumber, verified });
    });

    await adapter.setPhoneNumber("u1", "+258841234567");

    // One call, not two: a second statement is one crash away from a number
    // nobody verified carrying a verified flag.
    expect(calls).toEqual([{ userId: "u1", phoneNumber: "+258841234567", verified: false }]);
  });

  it("clears the number when given null", async () => {
    const calls: (string | null)[] = [];
    const adapter = new BetterAuthIdentityAdapter(async (_id, phoneNumber) => {
      calls.push(phoneNumber);
    });

    await adapter.setPhoneNumber("u1", null);

    expect(calls).toEqual([null]);
  });

  it("turns a unique violation into a domain error", async () => {
    const adapter = new BetterAuthIdentityAdapter(async () => {
      throw Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      });
    });

    await expect(adapter.setPhoneNumber("u1", "+258841234567")).rejects.toBeInstanceOf(
      PhoneNumberAlreadyInUseError,
    );
  });

  it("lets any other database error through untouched", async () => {
    const adapter = new BetterAuthIdentityAdapter(async () => {
      throw Object.assign(new Error("connection terminated"), { code: "57P01" });
    });

    await expect(adapter.setPhoneNumber("u1", "+258841234567")).rejects.toThrow(
      "connection terminated",
    );
  });
});
