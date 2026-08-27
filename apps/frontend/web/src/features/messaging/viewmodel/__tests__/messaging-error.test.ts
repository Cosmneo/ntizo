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

  it("surfaces THREAD_NOT_VISIBLE, not the coarse UNPROCESSABLE — deliberately the same answer a missing thread gives", () => {
    // The real wire shape: `ThreadNotVisibleError` extends the kit's
    // `UnprocessableError` and constructs it with the explicit code
    // `"THREAD_NOT_VISIBLE"` (`communication/domain/exceptions.ts`), and
    // the kit's `mapErrorToGraphQLError` emits `originalCode: error.code`
    // *unconditionally* for any `CodedError` — confirmed reading the
    // compiled source (`dist/graphql/shared/index.cjs`); there is no
    // branch that omits it. `originalCode` is therefore never absent here.
    // A review round caught an earlier version of this fixture asserting
    // against a shape (`code: "UNPROCESSABLE"` with no `originalCode`) the
    // server never actually sends — this is the corrected one.
    const err = new GraphqlError(200, [
      {
        message: "No such conversation.",
        extensions: { code: "UNPROCESSABLE", originalCode: "THREAD_NOT_VISIBLE" },
      },
    ]);

    expect(messagingErrorCode(err)).toBe("THREAD_NOT_VISIBLE");
  });

  it("surfaces PROVIDER_NOT_CONTACTABLE, the other UnprocessableError this feature raises — a different code, a different sentence", () => {
    // Same wire shape as THREAD_NOT_VISIBLE (both are UnprocessableError
    // subclasses), different constructed code — asserted as its own case,
    // not folded into the test above, so a change that collapsed both back
    // to the coarse "UNPROCESSABLE" would be visible on whichever of the
    // two a caller actually hit.
    const err = new GraphqlError(200, [
      {
        message: "This provider cannot be messaged.",
        extensions: { code: "UNPROCESSABLE", originalCode: "PROVIDER_NOT_CONTACTABLE" },
      },
    ]);

    expect(messagingErrorCode(err)).toBe("PROVIDER_NOT_CONTACTABLE");
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

  it("tells all four real wire shapes apart from each other in the same run", () => {
    // The codes Task 10/11 need to distinguish, asserted together so a
    // change that accidentally collapses two of them is visible here — not
    // just in tests that could each pass in isolation against a constant
    // return value. All four fixtures carry `originalCode` — the shape the
    // server actually sends in every case, per the doc comment above.
    const unauthenticated = messagingErrorCode(
      new GraphqlError(200, [
        { message: "x", extensions: { code: "FORBIDDEN", originalCode: "UNAUTHENTICATED" } },
      ]),
    );
    const threadNotVisible = messagingErrorCode(
      new GraphqlError(200, [
        { message: "x", extensions: { code: "UNPROCESSABLE", originalCode: "THREAD_NOT_VISIBLE" } },
      ]),
    );
    const providerNotContactable = messagingErrorCode(
      new GraphqlError(200, [
        { message: "x", extensions: { code: "UNPROCESSABLE", originalCode: "PROVIDER_NOT_CONTACTABLE" } },
      ]),
    );
    const invalid = messagingErrorCode(
      new GraphqlError(200, [
        { message: "x", extensions: { code: "VALIDATION_ERROR", originalCode: "OBJECT_VALIDATION_ERROR" } },
      ]),
    );

    expect(
      new Set([unauthenticated, threadNotVisible, providerNotContactable, invalid]).size,
    ).toBe(4);
  });
});
