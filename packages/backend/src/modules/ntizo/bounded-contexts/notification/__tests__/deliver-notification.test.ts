import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { DeliverNotificationInternalCommand } from "../app/use-cases/deliver-notification.internal.command";

class FakeDeliveries {
  saved: Array<{ status: string; toEmail: string; locale: string }> = [];
  updates: Array<{ id: string; status: string }> = [];
  async save(e: { status: string; toEmail: string; locale: string }) {
    this.saved.push({ status: e.status, toEmail: e.toEmail, locale: e.locale });
    return `d${this.saved.length}`;
  }
  async update(id: string, e: { status: string }) {
    this.updates.push({ id, status: e.status });
  }
  async findByProviderMessageId() {
    return null;
  }
}

class FakeSuppressions {
  suppressed = new Set<string>();
  async isSuppressed(email: string) {
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
  async sendEmail(m: { to: string[] }) {
    if (this.fail) throw new Error("resend exploded");
    this.sent.push(m.to[0]!);
    return { messageId: `msg${this.sent.length}` };
  }
}

let deliveries: FakeDeliveries;
let suppressions: FakeSuppressions;
let renderer: FakeRenderer;
let sender: FakeSender;
let cmd: DeliverNotificationInternalCommand;

beforeEach(() => {
  deliveries = new FakeDeliveries();
  suppressions = new FakeSuppressions();
  renderer = new FakeRenderer();
  sender = new FakeSender();
  cmd = new DeliverNotificationInternalCommand(
    deliveries as never,
    suppressions as never,
    new FakeRecipients() as never,
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

describe("a personal notification", () => {
  it("writes the row before attempting, then updates it", async () => {
    await cmd.execute(personal);
    expect(deliveries.saved[0]!.status).toBe("queued");
    expect(deliveries.updates[0]).toEqual({ id: "d1", status: "sent" });
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
    await cmd.execute({
      notificationId: "n2",
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
      payload: { from: "pending", to: "active" },
    });
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
    await cmd.execute({
      notificationId: "n2",
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
      payload: { from: "pending", to: "active" },
    });
    const statuses = deliveries.updates.map((u) => u.status).sort();
    expect(statuses).toEqual(["failed", "sent"]);
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
});

describe("a type with no template", () => {
  it("sends nothing and records nothing, rather than failing", async () => {
    renderer.render = () => null;
    const out = await cmd.execute(personal);
    expect(out.deliveryIds).toEqual([]);
    expect(sender.sent).toEqual([]);
  });
});
