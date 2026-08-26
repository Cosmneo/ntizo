import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { authErrorMessage } from "../auth-error";
import { authErrorKey, GENERIC_AUTH_ERROR_KEY, NETWORK_AUTH_ERROR_KEY } from "../../domain/errors";
import enAuth from "../../../../shared/locales/en-US/auth.json";

/** Stands in for i18next: returns the key, so assertions name the copy chosen. */
const t = ((key: string) => key) as unknown as TFunction;

/** Every code observed against the running dev API on 2026-08-26. */
const REAL_CODES = [
  "INVALID_EMAIL_OR_PASSWORD",
  "FAILED_TO_CREATE_USER",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "VALIDATION_ERROR",
  "INVALID_TOKEN",
  "OTP_NOT_FOUND",
];

function copyExists(dotted: string): boolean {
  return dotted
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      enAuth,
    ) !== undefined;
}

describe("authErrorMessage", () => {
  it("gives every code the API actually returns its own copy", () => {
    // Guessed codes compile, never match, and leave the generic line showing
    // forever with nothing failing. These were probed against dev, and this
    // pins that the mapping still covers them.
    for (const code of REAL_CODES) {
      expect(authErrorKey(code), code).toBeDefined();
      expect(authErrorMessage(t, { code })).not.toBe(GENERIC_AUTH_ERROR_KEY);
    }
  });

  it("never points at copy that does not exist", () => {
    // A key with no translation renders as the key itself — "errors.generic"
    // on screen, which is the exact look of a broken app this whole module
    // exists to prevent. i18n-parity then guarantees the other seven locales.
    const keys = [
      ...REAL_CODES.map((c) => authErrorKey(c)!),
      GENERIC_AUTH_ERROR_KEY,
      NETWORK_AUTH_ERROR_KEY,
      "errors.tooManyAttempts",
    ];
    for (const key of keys) expect(copyExists(key), key).toBe(true);
  });

  it("never shows the server's own message", () => {
    // The validation failure comes back as "[body.email] Invalid email
    // address" — a field path from the server's validator.
    const raw = "[body.email] Invalid email address";
    expect(authErrorMessage(t, { code: "VALIDATION_ERROR", message: raw })).not.toContain("body.email");
    expect(authErrorMessage(t, { code: "SOMETHING_NEW", message: raw })).not.toContain("body.email");
  });

  it("answers a rate limit from the status, which carries no code", () => {
    expect(authErrorMessage(t, { status: 429 })).toBe("errors.tooManyAttempts");
  });

  it("tells someone offline to check their connection", () => {
    // fetch rejects with a TypeError when the request never left the machine.
    expect(authErrorMessage(t, new TypeError("Failed to fetch"))).toBe(NETWORK_AUTH_ERROR_KEY);
  });

  it("falls back to generic copy and logs what it could not map", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(authErrorMessage(t, { code: "A_CODE_FROM_A_FUTURE_VERSION" })).toBe(
      GENERIC_AUTH_ERROR_KEY,
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("survives being handed nothing at all", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(authErrorMessage(t, undefined)).toBe(GENERIC_AUTH_ERROR_KEY);
    expect(authErrorMessage(t, null)).toBe(GENERIC_AUTH_ERROR_KEY);
    spy.mockRestore();
  });
});
