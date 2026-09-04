import { describe, expect, it } from "bun:test";
import {
  SupportRequest,
  SUPPORT_SUBJECT_MAX,
} from "../domain/aggregates/support-request.aggregate";
import {
  SupportAlreadyResolvedError,
  SupportRequestNotResolvedError,
  SupportSubjectInvalidError,
} from "../domain/exceptions";

const NOW = new Date("2026-09-02T10:00:00.000Z");
const LATER = new Date("2026-09-02T11:00:00.000Z");

function open(subject = "O prestador não apareceu") {
  return SupportRequest.open({ threadId: "t1", audience: "customer", subject, bookingId: null, now: NOW });
}

describe("opening", () => {
  it("trims the subject and starts open", () => {
    const r = open("  Reembolso  ");
    expect(r.subject).toBe("Reembolso");
    expect(r.status).toBe("open");
    expect(r.resolvedAt).toBeNull();
    expect(r.resolvedByUserId).toBeNull();
    expect(r.createdAt).toEqual(NOW);
  });

  it("refuses an empty subject", () => {
    expect(() => open("   ")).toThrow(SupportSubjectInvalidError);
  });

  it("refuses a subject over the limit, measured after trimming", () => {
    expect(() => open(" " + "x".repeat(SUPPORT_SUBJECT_MAX) + " ")).not.toThrow();
    expect(() => open("x".repeat(SUPPORT_SUBJECT_MAX + 1))).toThrow(SupportSubjectInvalidError);
  });

  it("normaliseSubject is the same rule, callable before a thread exists", () => {
    expect(SupportRequest.normaliseSubject("  a ")).toBe("a");
    expect(() => SupportRequest.normaliseSubject("")).toThrow(SupportSubjectInvalidError);
  });
});

describe("resolving and reopening", () => {
  it("resolve records who and when", () => {
    const r = open().resolve("admin-1", LATER);
    expect(r.status).toBe("resolved");
    expect(r.resolvedAt).toEqual(LATER);
    expect(r.resolvedByUserId).toBe("admin-1");
  });

  it("resolve twice is refused", () => {
    const r = open().resolve("admin-1", LATER);
    expect(() => r.resolve("admin-2", LATER)).toThrow(SupportAlreadyResolvedError);
  });

  it("reopen clears the resolution", () => {
    const r = open().resolve("admin-1", LATER).reopen();
    expect(r.status).toBe("open");
    expect(r.resolvedAt).toBeNull();
    expect(r.resolvedByUserId).toBeNull();
  });

  it("reopen on an open request is refused", () => {
    expect(() => open().reopen()).toThrow(SupportRequestNotResolvedError);
  });

  it("rehydrate trusts the row", () => {
    const r = SupportRequest.rehydrate({
      threadId: "t1",
      audience: "provider",
      subject: "",
      bookingId: "b1",
      kind: "dispute",
      status: "resolved",
      resolvedAt: LATER,
      resolvedByUserId: "admin-1",
      createdAt: NOW,
    });
    expect(r.subject).toBe("");
    expect(r.audience).toBe("provider");
    // A stored dispute comes back a dispute. `rehydrate` takes `kind`
    // required rather than defaulted for exactly this: a repository that
    // forgot to read the column would otherwise hand back an ordinary
    // request, and resolving it would stop moving the booking it is about.
    expect(r.kind).toBe("dispute");
  });

  // The other half, and the one every caller that predates disputes relies
  // on: `open` without a `kind` is an ordinary support request, matching the
  // column's own `DEFAULT 'support'`.
  it("opens as an ordinary support request unless a kind says otherwise", () => {
    expect(open().kind).toBe("support");
    expect(
      SupportRequest.open({
        threadId: "t1",
        audience: "customer",
        subject: "Avaria eléctrica urgente",
        bookingId: "b1",
        kind: "dispute",
        now: NOW,
      }).kind,
    ).toBe("dispute");
  });
});
