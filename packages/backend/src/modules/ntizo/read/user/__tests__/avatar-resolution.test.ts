import { describe, expect, it } from "bun:test";
import { resolveAvatarUrl } from "../infra/repositories/drizzle/user-read.repository";

/**
 * `mediaUrl` reads `MEDIA_PUBLIC_URL_BASE` off the request-scoped infra store,
 * which is absent here — see its own test for what it returns without one.
 * What matters at this level is precedence, so the composer is injected.
 */
const compose = (key: string) => `https://cdn.example/${key}`;

describe("resolveAvatarUrl", () => {
  it("prefers the uploaded photo over the provider's", () => {
    expect(
      resolveAvatarUrl("avatar/u1/1", "https://lh3.googleusercontent.com/a/x", compose),
    ).toBe("https://cdn.example/avatar/u1/1");
  });

  it("falls back to the provider's photo when nothing was uploaded", () => {
    expect(resolveAvatarUrl(null, "https://lh3.googleusercontent.com/a/x", compose)).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
  });

  it("falls back when the key cannot be composed into a URL", () => {
    // Locally `MEDIA_PUBLIC_URL_BASE` may be unset. A null from the composer
    // must not swallow the photo the person does have.
    expect(
      resolveAvatarUrl("avatar/u1/1", "https://lh3.googleusercontent.com/a/x", () => null),
    ).toBe("https://lh3.googleusercontent.com/a/x");
  });

  it("is null when there is no photo at all", () => {
    expect(resolveAvatarUrl(null, null, compose)).toBeNull();
  });
});
