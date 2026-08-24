import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { DeliverNotificationInternalCommand } from "../app/use-cases/deliver-notification.internal.command";

class FakeDeliveries {
  saved: Array<{ status: string; toEmail: string; locale: string }> = [];
  updates: Array<{ id: string; status: string; providerMessageId: string | null }> = [];
  async save(e: { status: string; toEmail: string; locale: string }) {
    this.saved.push({ status: e.status, toEmail: e.toEmail, locale: e.locale });
    return `d${this.saved.length}`;
  }
  async update(id: string, e: { status: string; providerMessageId: string | null }) {
    this.updates.push({ id, status: e.status, providerMessageId: e.providerMessageId });
  }
  async findByProviderMessageId() {
    return null;
  }
}

class FakeSuppressions {
  suppressed = new Set<string>();
  calls = 0;
  async isSuppressed(email: string) {
    this.calls += 1;
    return this.suppressed.has(email);
  }
  async suppress() {}
}

class FakeRecipients {
  async forUser(userId: string) {
    return userId === "u1" ? { userId, email: "ana@ntizo.test", locale: "pt-MZ" } : null;
  }
  async forProviderMembers() {
    return [
      { userId: "u1", email: "ana@ntizo.test", locale: "pt-MZ" },
      { userId: "u2", email: "luc@ntizo.test", locale: "fr-FR" },
    ];
  }
}

class FakeRenderer {
  rendered: string[] = [];
  render(
    type: string,
    locale: string,
  ): { subject: string; html: string; text: string } | null {
    this.rendered.push(`${type}:${locale}`);
    return { subject: "s", html: "h", text: "t" };
  }
}

class FakeSender {
  sent: string[] = [];
  fail = false;
  async sendEmail(m: { to: string[] }): Promise<{ messageId: string | null }> {
    if (this.fail) throw new Error("resend exploded");
    this.sent.push(m.to[0]!);
    return { messageId: `msg${this.sent.length}` };
  }
}

let deliveries: FakeDeliveries;
let suppressions: FakeSuppressions;
let recipients: FakeRecipients;
let renderer: FakeRenderer;
let sender: FakeSender;
let cmd: DeliverNotificationInternalCommand;

beforeEach(() => {
  deliveries = new FakeDeliveries();
  suppressions = new FakeSuppressions();
  recipients = new FakeRecipients();
  renderer = new FakeRenderer();
  sender = new FakeSender();
  cmd = new DeliverNotificationInternalCommand(
    deliveries as never,
    suppressions as never,
    recipients as never,
    renderer as never,
    sender as never,
  );
});

const personal = {
  notificationId: "n1",
  type: NotificationType.Welcome,
  audience: "user" as const,
  userId: "u1",
  payload: { firstName: "Ana" },
};

const workspace = {
  notificationId: "n2",
  type: NotificationType.ProviderVerified,
  audience: "provider" as const,
  providerId: "p1",
  payload: { from: "pending", to: "active" },
};

describe("a personal notification", () => {
  it("writes the row before attempting, then updates it", async () => {
    await cmd.execute(personal);
    expect(deliveries.saved[0]!.status).toBe("queued");
    // The real id, not just its presence: a regression that dropped the
    // provider's message id on the floor (e.g. `markSent(null)` no matter
    // what came back) would still pass a looser assertion here, and the id
    // is the only thing a bounce webhook has to find this row again by.
    expect(deliveries.updates[0]).toEqual({
      id: "d1",
      status: "sent",
      providerMessageId: "msg1",
    });
  });

  it("writes in the recipient's own language", async () => {
    await cmd.execute(personal);
    expect(renderer.rendered).toEqual(["WELCOME:pt-MZ"]);
  });

  it("records a failure without throwing at its caller", async () => {
    sender.fail = true;
    await expect(cmd.execute(personal)).resolves.toBeDefined();
    expect(deliveries.updates[0]!.status).toBe("failed");
  });
});

describe("a workspace notification", () => {
  it("becomes one delivery per member, each in their own language", async () => {
    await cmd.execute(workspace);
    expect(renderer.rendered.sort()).toEqual([
      "PROVIDER_VERIFIED:fr-FR",
      "PROVIDER_VERIFIED:pt-MZ",
    ]);
    expect(sender.sent.sort()).toEqual(["ana@ntizo.test", "luc@ntizo.test"]);
  });

  it("one member's failure does not stop the others", async () => {
    // The whole reason these are separate deliveries. A French colleague
    // still hears about it when a Portuguese owner's address bounces.
    let calls = 0;
    sender.sendEmail = async () => {
      calls += 1;
      if (calls === 1) throw new Error("first one exploded");
      return { messageId: "msg2" };
    };
    await cmd.execute(workspace);
    const statuses = deliveries.updates.map((u) => u.status).sort();
    expect(statuses).toEqual(["failed", "sent"]);
  });

  it("still delivers to the other member when one member's row fails to save", async () => {
    // The property "one member's failure does not stop the others" above
    // does not cover: a throw from `save` itself — before there is even a
    // row — happens outside the try that turns a send failure into a
    // "failed" status. It must still be caught per-recipient, not just
    // around the send, or the first member's infrastructure failure takes
    // every later recipient in the loop down with it.
    let calls = 0;
    deliveries.save = async (e) => {
      calls += 1;
      if (calls === 1) throw new Error("row insert failed");
      deliveries.saved.push({ status: e.status, toEmail: e.toEmail, locale: e.locale });
      return `d${deliveries.saved.length}`;
    };
    await expect(cmd.execute(workspace)).resolves.toBeDefined();
    expect(sender.sent).toEqual(["luc@ntizo.test"]);
  });
});

describe("an address we must not write to", () => {
  it("records the refusal and never calls the sender", async () => {
    suppressions.suppressed.add("ana@ntizo.test");
    await cmd.execute(personal);
    expect(deliveries.saved[0]!.status).toBe("suppressed");
    expect(sender.sent).toEqual([]);
    // Not "failed": nothing was attempted, and the audit must be able to tell
    // the difference between what we tried and what we refused.
    expect(deliveries.updates).toEqual([]);
  });

  it("does not throw when recording the refusal itself fails", async () => {
    // The `return await this.deliveries.save(...)` on the suppressed path
    // has to actually await: a bare `return this.deliveries.save(...)`
    // returns the rejected promise without it ever throwing inside
    // deliverOne's try, so the rejection would escape uncaught. This is the
    // test that goes red if that `await` is ever "simplified" away.
    suppressions.suppressed.add("ana@ntizo.test");
    deliveries.save = async () => {
      throw new Error("suppression row insert failed");
    };
    await expect(cmd.execute(personal)).resolves.toEqual({ deliveryIds: [] });
  });
});

describe("a type with no template", () => {
  it("sends nothing and records nothing, rather than failing", async () => {
    renderer.render = () => null;
    const out = await cmd.execute(personal);
    expect(out.deliveryIds).toEqual([]);
    expect(sender.sent).toEqual([]);
    // The other half of "costs nothing": no row and no suppression lookup
    // either. A regression that checked suppression or wrote the row before
    // noticing there was no template would pass the two assertions above
    // unchanged.
    expect(deliveries.saved).toEqual([]);
    expect(suppressions.calls).toBe(0);
  });
});

describe("a provider message id", () => {
  it("round-trips a null id as null, not an empty string", async () => {
    // EmailServicePort's own contract: null is "sent, no id given back", a
    // real fact, not a missing value to default away. Storing "" would put
    // every such delivery into notification_delivery_message_idx's sparse
    // partial index under the same key.
    sender.sendEmail = async (m) => {
      sender.sent.push(m.to[0]!);
      return { messageId: null };
    };
    await cmd.execute(personal);
    expect(deliveries.updates[0]).toMatchObject({ status: "sent", providerMessageId: null });
  });
});

describe("an email that sent but couldn't be recorded", () => {
  it("does not mark it failed just because the recording update failed", async () => {
    // The send already succeeded by the time this update runs. Marking the
    // row `failed` here would be a false record — worse than a missing one,
    // since `failed` means "did not send" and invites a resend of an email
    // its recipient already has. It stays `queued`: the honest "we don't
    // know what happened", visible to whoever reads the row, with the
    // update's own error only logged.
    deliveries.update = async () => {
      throw new Error("connection dropped after send");
    };
    const out = await cmd.execute(personal);
    expect(out.deliveryIds).toEqual([]);
    expect(deliveries.saved[0]!.status).toBe("queued");
    expect(deliveries.updates).toEqual([]);
  });
});

describe("an unguarded port throwing", () => {
  it("does not throw when the recipient reader fails", async () => {
    recipients.forUser = async () => {
      throw new Error("connection reset");
    };
    await expect(cmd.execute(personal)).resolves.toEqual({ deliveryIds: [] });
  });

  it("does not throw when the renderer fails", async () => {
    renderer.render = () => {
      throw new Error("template registry blew up");
    };
    await expect(cmd.execute(personal)).resolves.toEqual({ deliveryIds: [] });
  });

  it("does not throw when the suppression check fails", async () => {
    suppressions.isSuppressed = async () => {
      throw new Error("suppression table unreachable");
    };
    await expect(cmd.execute(personal)).resolves.toEqual({ deliveryIds: [] });
  });

  it("does not throw when saving the queued row fails", async () => {
    deliveries.save = async () => {
      throw new Error("insert failed");
    };
    await expect(cmd.execute(personal)).resolves.toEqual({ deliveryIds: [] });
  });
});
