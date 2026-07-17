import { describe, expect, it } from "vitest";
import type { CurrentUserDTO } from "@ntizo/shared";
import {
  accessibleZones,
  canAccessAdmin,
  canAccessProvider,
  isSafeInternalPath,
  resolvePostLoginDestination,
} from "@/shared/lib/zones";

const user = (role: CurrentUserDTO["role"]): CurrentUserDTO =>
  ({ id: "u1", email: "a@b.c", role, status: "active", createdAt: "", name: "",
     firstName: "", lastName: "", displayName: "", avatarUrl: null,
     phoneNumber: null, bio: null, language: "en", timezone: "UTC" });

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

describe("accessibleZones", () => {
  it("always includes landing; adds provider/admin per access", () => {
    expect(accessibleZones(null, 0)).toEqual(["landing"]);
    expect(accessibleZones(user("individual_provider"), 0)).toEqual(["landing", "provider"]);
    expect(accessibleZones(user("admin"), 0)).toEqual(["landing", "admin"]);
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
});
