import { describe, expect, it } from "vitest";
import { resolvePostLoginDestination } from "@/shared/lib/zones";

/**
 * The chain from "become a provider" to a working workspace.
 *
 * Every link on that page ends in the onboarding wizard, and the interesting
 * case is the visitor who is not signed in yet: registration sits between the
 * click and the wizard, and the intent has to survive it. It did not — someone
 * registered, landed on the customer home, and the thing they came to do was
 * never offered again.
 *
 * The page's own branch is one line (`user ? … : …`); what is worth pinning is
 * the part that decides where a just-registered person lands, because that is
 * shared with sign-in, the public-route guard and the verification callback.
 */
describe("post-registration destination", () => {
  const customer = { role: "customer" } as Parameters<
    typeof resolvePostLoginDestination
  >[0];

  it("sends someone who came to become a provider to the wizard", () => {
    // A brand-new account owns nothing and has the customer role, so without
    // the carried intent this resolves to "/" — which is exactly the break.
    expect(resolvePostLoginDestination(customer, "/onboarding", 0)).toBe(
      "/onboarding",
    );
  });

  it("still sends them there once they already own a provider", () => {
    // A second workspace is a legitimate thing to want, and ownership must not
    // hijack the request into the existing one.
    expect(resolvePostLoginDestination(customer, "/onboarding", 3)).toBe(
      "/onboarding",
    );
  });

  it("falls back to the customer home when no intent was carried", () => {
    expect(resolvePostLoginDestination(customer, null, 0)).toBe("/");
  });

  it("refuses an off-site destination", () => {
    // The intent reaches a redirect target and a `callbackURL`, so an
    // unchecked value here is an open redirect.
    expect(resolvePostLoginDestination(customer, "https://evil.test/x", 0)).toBe(
      "/",
    );
    expect(resolvePostLoginDestination(customer, "//evil.test", 0)).not.toBe(
      "//evil.test",
    );
  });
});
