import { describe, expect, it } from "vitest";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { messagingErrorCode } from "../messaging-error";

describe("messagingErrorCode", () => {
  it("surfaces UNAUTHENTICATED — the domain code, not the flattened FORBIDDEN every ForbiddenError wears on the wire", () => {
    // The real wire shape for an anonymous caller (confirmed in Task 7/8's
    // live-server introspection): the kit always reports the coarse
    // `code: "FORBIDDEN"` for a ForbiddenError, whatever code it was
    // constructed with. A caller that branched on the coarse code alone
    // could not tell "sign in" apart from a genuine forbidden.
    const err = new GraphqlError(200, [
      {
        message: "Sign in to see your messages",
        extensions: { code: "FORBIDDEN", originalCode: "UNAUTHENTICATED" },
      },
    ]);

    expect(messagingErrorCode(err)).toBe("UNAUTHENTICATED");
  });

  it("surfaces UNPROCESSABLE for a genuine refusal — deliberately the same answer a missing thread gives", () => {
    const err = new GraphqlError(200, [
      {
        message: "Conversation not found",
        extensions: { code: "UNPROCESSABLE" },
      },
    ]);

    expect(messagingErrorCode(err)).toBe("UNPROCESSABLE");
  });

  it("surfaces the coarse VALIDATION_ERROR, not the kit's internal OBJECT_VALIDATION_ERROR subtype", () => {
    // The other real wire shape from the same introspection: a rejected
    // `body` (or an out-of-range `limit`) carries `code: "VALIDATION_ERROR"`
    // with `originalCode: "OBJECT_VALIDATION_ERROR"` — the reverse of the
    // ForbiddenError case above. Preferring originalCode here, the way the
    // UNAUTHENTICATED case correctly does, would hand a caller
    // "OBJECT_VALIDATION_ERROR" instead of the stable "VALIDATION_ERROR" a
    // composer actually checks for.
    const err = new GraphqlError(200, [
      {
        message: "Input validation failed",
        extensions: { code: "VALIDATION_ERROR", originalCode: "OBJECT_VALIDATION_ERROR" },
      },
    ]);

    expect(messagingErrorCode(err)).toBe("VALIDATION_ERROR");
  });

  it("returns undefined for a non-GraphqlError, and for no error at all", () => {
    expect(messagingErrorCode(new Error("network down"))).toBeUndefined();
    expect(messagingErrorCode(null)).toBeUndefined();
    expect(messagingErrorCode(undefined)).toBeUndefined();
  });

  it("tells all three cases apart from each other in the same run", () => {
    // The three codes Task 10/11 need to distinguish, asserted together so
    // a change that accidentally collapses two of them is visible here —
    // not just in three tests that could each pass in isolation against a
    // constant return value.
    const unauthenticated = messagingErrorCode(
      new GraphqlError(200, [
        { message: "x", extensions: { code: "FORBIDDEN", originalCode: "UNAUTHENTICATED" } },
      ]),
    );
    const refused = messagingErrorCode(
      new GraphqlError(200, [{ message: "x", extensions: { code: "UNPROCESSABLE" } }]),
    );
    const invalid = messagingErrorCode(
      new GraphqlError(200, [
        { message: "x", extensions: { code: "VALIDATION_ERROR", originalCode: "OBJECT_VALIDATION_ERROR" } },
      ]),
    );

    expect(new Set([unauthenticated, refused, invalid]).size).toBe(3);
  });
});
