import { describe, expect, it } from "bun:test";
import { User } from "../user.aggregate";

describe("User.create", () => {
  it("records user.registered, so no future call site can create a user silently", async () => {
    const user = User.create({ id: "u1", email: "ana@ntizo.test", firstName: "Ana" });

    const events = user.pullEvents();
    expect(events.map((e) => e.eventName)).toEqual(["user.registered"]);
    expect(events[0]!.aggregateId).toBe("u1");
    expect(events[0]!.payload).toEqual({
      userId: "u1",
      email: "ana@ntizo.test",
      firstName: "Ana",
    });
  });

  it("records the event with a null first name when none was given", () => {
    const user = User.create({ id: "u1", email: "ana@ntizo.test" });
    expect((user.pullEvents()[0]!.payload as { firstName: string | null }).firstName).toBeNull();
  });

  it("hands each event out once", () => {
    const user = User.create({ id: "u1", email: "ana@ntizo.test", firstName: "Ana" });
    expect(user.pullEvents()).toHaveLength(1);
    // Two publishes of one registration is two welcomes.
    expect(user.pullEvents()).toHaveLength(0);
  });
});

describe("User.rehydrate", () => {
  it("records nothing, because loading a row is not a registration", () => {
    const user = User.rehydrate({
      id: "u1",
      email: "ana@ntizo.test",
      role: "customer",
      status: "active",
      verificationStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Every read of a user row goes through here. An event recorded on
    // rehydrate would welcome somebody again on every sign-in.
    expect(user.pullEvents()).toEqual([]);
  });
});
