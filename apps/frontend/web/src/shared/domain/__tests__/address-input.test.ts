import { describe, expect, it } from "vitest";
import type { AddressDTO } from "@ntizo/shared";
import { toAddressInput } from "@/shared/domain/address-input";

const base: AddressDTO = {
  id: "a1", label: "Casa", country: "MZ", city: "Maputo", district: "Bairro Central",
  line1: "Av. Julius Nyerere 1234", line2: null, postalCode: null, directions: null,
  latitude: null, longitude: null, isDefault: true,
};

describe("toAddressInput", () => {
  it("joins line1 and line2, because a flat number lives in the second line", () => {
    expect(toAddressInput({ ...base, line2: "3.º andar" }).line).toBe(
      "Av. Julius Nyerere 1234, 3.º andar",
    );
  });

  it("omits an absent second line rather than leaving a trailing comma", () => {
    expect(toAddressInput(base).line).toBe("Av. Julius Nyerere 1234");
  });

  it("parses stored coordinates, which cross the wire as strings", () => {
    const out = toAddressInput({ ...base, latitude: "-25.9692", longitude: "32.5732" });
    expect(out.lat).toBe(-25.9692);
    expect(out.lng).toBe(32.5732);
  });

  it("turns an unparseable coordinate into null rather than NaN", () => {
    expect(toAddressInput({ ...base, latitude: "not a number" }).lat).toBeNull();
  });

  it("carries the label, city, district and directions through untouched", () => {
    const out = toAddressInput({ ...base, directions: "Portão azul" });
    expect(out).toMatchObject({
      label: "Casa", city: "Maputo", district: "Bairro Central", directions: "Portão azul",
    });
  });
});
