import { describe, expect, it } from "vitest";
import type { CurrentUserDTO } from "@ntizo/shared";
import {
  canAccessAdmin,
  canAccessProvider,
  isSafeInternalPath,
  resolvePostLoginDestination,
  showsHelpLauncher,
  zoneOwnsChrome,
} from "@/shared/lib/zones";

const user = (role: CurrentUserDTO["role"]): CurrentUserDTO =>
  ({ id: "u1", email: "a@b.c", role, status: "active", createdAt: "", name: "",
     firstName: "", lastName: "", displayName: "", avatarUrl: null,
     avatarKey: null,
     phoneNumber: null, bio: null, language: "en-US", timezone: "UTC",
     dateOfBirth: null, gender: null });

describe("canAccessAdmin", () => {
  it("is true only for admin role", () => {
    expect(canAccessAdmin(user("admin"))).toBe(true);
    expect(canAccessAdmin(user("customer"))).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
  });
});

describe("canAccessProvider", () => {
  it("is true for provider roles or when the user owns >=1 provider", () => {
    expect(canAccessProvider(user("individual_provider"), 0)).toBe(true);
    expect(canAccessProvider(user("organization_owner"), 0)).toBe(true);
    expect(canAccessProvider(user("customer"), 1)).toBe(true);
    expect(canAccessProvider(user("customer"), 0)).toBe(false);
    expect(canAccessProvider(null, 0)).toBe(false);
  });
});

describe("isSafeInternalPath", () => {
  it("accepts app-internal paths and rejects external / protocol-relative URLs", () => {
    expect(isSafeInternalPath("/provider/overview")).toBe(true);
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath("relative")).toBe(false);
    expect(isSafeInternalPath("/\\evil.com")).toBe(false);
    expect(isSafeInternalPath("/\t/evil.com")).toBe(false);
    expect(isSafeInternalPath("/admin/users?next=/x")).toBe(true);
  });
});

describe("resolvePostLoginDestination", () => {
  it("prefers a safe next, else routes by role", () => {
    expect(resolvePostLoginDestination(user("admin"), "/admin/users")).toBe("/admin/users");
    expect(resolvePostLoginDestination(user("admin"), null)).toBe("/admin");
    expect(resolvePostLoginDestination(user("organization_owner"), null)).toBe("/provider");
    expect(resolvePostLoginDestination(user("customer"), null)).toBe("/");
    expect(resolvePostLoginDestination(user("admin"), "https://evil.com")).toBe("/admin");
  });

  // `upgradeToProvider()` sets verificationStatus and deliberately leaves role
  // as "customer", so ownership — not role — is what makes the provider zone
  // reachable. This must agree with canAccessProvider, which the zone switcher
  // uses; otherwise the switcher offers a zone that login refuses to route to.
  it("routes a provider-owning customer to /provider", () => {
    expect(resolvePostLoginDestination(user("customer"), null, 1)).toBe("/provider");
  });

  it("agrees with canAccessProvider for every user/ownership combination", () => {
    for (const role of ["customer", "individual_provider", "organization_owner"] as const) {
      for (const count of [0, 1]) {
        const u = user(role);
        const expected = canAccessProvider(u, count) ? "/provider" : "/";
        expect(resolvePostLoginDestination(u, null, count)).toBe(expected);
      }
    }
  });

  it("keeps admin ahead of provider ownership", () => {
    expect(resolvePostLoginDestination(user("admin"), null, 3)).toBe("/admin");
  });

  it("still honours an explicit next over ownership", () => {
    expect(resolvePostLoginDestination(user("customer"), "/provider/members", 1)).toBe(
      "/provider/members",
    );
  });
});

describe("zoneOwnsChrome", () => {
  it("claims the provider and admin zones and their descendants", () => {
    for (const path of [
      "/provider",
      "/provider/",
      "/provider/demo-org/overview",
      "/provider/settings/documents",
      "/admin",
      "/admin/users",
      "/admin/providers",
    ]) {
      expect(zoneOwnsChrome(path)).toBe(true);
    }
  });

  it("leaves the customer pages alone, checkout included", () => {
    // Checkout keeps the bottom bar on purpose — see `OWN_CHROME`. It only
    // swaps the top of the page for its own header.
    for (const path of [
      "/",
      "/account",
      "/onboarding",
      "/become-provider",
      "/sign-in",
      "/book/svc-1",
      "/booking/bk-1/details",
      "/booking/bk-1/confirm",
    ]) {
      expect(zoneOwnsChrome(path)).toBe(false);
    }
  });

  it("does not mistake the public provider directory for the provider zone", () => {
    // The reason this is compared by segment: "/providers" starts with
    // "/provider", and a prefix test would strip the bottom bar from a
    // customer page that has nothing else to navigate with.
    expect(zoneOwnsChrome("/providers")).toBe(false);
    expect(zoneOwnsChrome("/providers/estudio-teste-7p41a5")).toBe(false);
    expect(zoneOwnsChrome("/administrators")).toBe(false);
  });
});

describe("showsHelpLauncher", () => {
  it("shows on the public site, the customer zone and the provider zone", () => {
    for (const path of ["/", "/services", "/providers/salao-x", "/messages", "/bookings", "/provider/salao-x/overview", "/help"]) {
      expect(showsHelpLauncher(path)).toBe(true);
    }
  });

  it("hides in the admin zone — the admin is support", () => {
    expect(showsHelpLauncher("/admin")).toBe(false);
    expect(showsHelpLauncher("/admin/support")).toBe(false);
  });

  it("hides in checkout, where the slot is on hold", () => {
    expect(showsHelpLauncher("/book/svc-1")).toBe(false);
    expect(showsHelpLauncher("/booking/b-1/confirm")).toBe(false);
  });

  it("shows on the booking details step, which is where somebody asks for help", () => {
    expect(showsHelpLauncher("/booking/b-1/details")).toBe(true);
  });
});
