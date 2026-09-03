import { afterEach, describe, expect, it, vi } from "vitest";
import { openSupportRequest } from "../support.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

describe("openSupportRequest", () => {
  it("sends only the fields it was given, and returns the thread id", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationOpenSupportRequest: { threadId: "t-1" } } as never);

    const threadId = await openSupportRequest({
      audience: "customer",
      subject: "  Reembolso  ",
      body: "  Paguei duas vezes  ",
    });

    expect(threadId).toBe("t-1");
    const [doc, vars] = spy.mock.calls[0]!;
    expect(doc).toContain("communicationOpenSupportRequest");
    // Trimmed here so the server's 1..120 bound is measured on what it will
    // store, and no `providerId`/`bookingId`/`attachments` key at all —
    // sending `undefined` makes the field present-and-null on the wire.
    expect(vars).toEqual({
      input: { audience: "customer", subject: "Reembolso", body: "Paguei duas vezes" },
    });
  });

  it("carries the provider, the booking and the attachments when there are any", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationOpenSupportRequest: { threadId: "t-2" } } as never);

    await openSupportRequest({
      audience: "provider",
      providerId: "p-1",
      subject: "Comissão",
      body: "Uma pergunta",
      bookingId: "b-1",
      attachments: [{ storageKey: "attachment/u-1/1-abc" }],
    });

    expect(spy.mock.calls[0]![1]).toEqual({
      input: {
        audience: "provider",
        providerId: "p-1",
        subject: "Comissão",
        body: "Uma pergunta",
        bookingId: "b-1",
        attachments: [{ storageKey: "attachment/u-1/1-abc" }],
      },
    });
  });
});
