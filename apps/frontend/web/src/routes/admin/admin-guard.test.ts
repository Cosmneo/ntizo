import { describe, expect, it } from "vitest";
import type { CurrentUserDTO } from "@ntizo/shared";
import { resolveAdminGuard } from "./admin-guard";

const admin = { role: "admin" } as CurrentUserDTO;
const customer = { role: "customer" } as CurrentUserDTO;

describe("resolveAdminGuard", () => {
  it("bounces unauthenticated users to sign-in with next", () => {
    expect(resolveAdminGuard(null, null, "/admin/users")).toEqual({
      redirectTo: "/sign-in", search: { next: "/admin/users" },
    });
  });
  it("bounces non-admins to landing", () => {
    expect(resolveAdminGuard({ user: {} }, customer, "/admin")).toEqual({ redirectTo: "/" });
  });
  it("allows admins through", () => {
    expect(resolveAdminGuard({ user: {} }, admin, "/admin")).toBeNull();
  });
});
