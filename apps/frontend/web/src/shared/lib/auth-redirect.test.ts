import { describe, expect, it } from "vitest";
import type { CurrentUserDTO } from "@ntizo/shared";
import { resolvePostLoginDestination } from "@/shared/lib/zones";

const admin = { role: "admin" } as CurrentUserDTO;

describe("_public authed redirect", () => {
  it("routes an already-authed admin away from the public zone", () => {
    expect(resolvePostLoginDestination(admin, null)).toBe("/admin");
  });
});
